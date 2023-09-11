﻿/**
 * @author Felix Müller
 */

import type { ItemData } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/module.mjs";
import API from "./api";
import CONSTANTS from "./constants";
import {
	Category,
	EncumbranceBulkData,
	EncumbranceData,
	InventoryPlusFlags,
	InventoryPlusItemType,
	inventoryPlusItemTypeCollectionForCharacter,
	inventoryPlusItemTypeCollectionForNPC,
	inventoryPlusItemTypeCollectionForVehicle,
} from "./inventory-plus-models";
import {
	debug,
	duplicateExtended,
	error,
	getCSSName,
	i18n,
	i18nFormat,
	info,
	isStringEquals,
	is_real_number,
	retrieveCategoryIdFromLabel,
	retrieveSectionIdFromItemType,
	warn,
} from "./lib/lib";
import {
	adjustCustomCategoriesForCharacter,
	adjustCustomCategoriesForNPC,
	adjustCustomCategoriesForVehicle,
	initCategoriesForCharacter,
	initCategoriesForNPC,
	initCategoriesForVehicle,
	defaultSectionsForCharacters,
	defaultSectionsForNPC,
	defaultSectionsForVehicle,
} from "./lib/prepare-data-inventory-plus";
// import ActorSheet5eCharacter from "../../systems/dnd5e/module/actor/sheets/character.js";

export class InventoryPlus {
	actor: Actor;
	customCategorys: Record<string, Category>;

	static processInventory(app: any, actor: Actor, inventory: Category[]) {
		//if (app.inventoryPlus === undefined) {
		app.inventoryPlus = new InventoryPlus();
		(<InventoryPlus>app.inventoryPlus).init(actor);
		//}
		return (<InventoryPlus>app.inventoryPlus).prepareInventory(actor, inventory);
	}

	init(actor: Actor) {
		// , inventory: Category[]
		this.actor = actor;
		this.initCategorys();
	}

	initCategorys() {
		let flagCategorys = <Record<string, Category>>(
			this.actor.getFlag(CONSTANTS.MODULE_NAME, InventoryPlusFlags.CATEGORYS)
		);
		const actorType = this.actor.type;
		if (actorType === "character") {
			flagCategorys = initCategoriesForCharacter(flagCategorys);
		} else if (actorType === "npc" && game.settings.get(CONSTANTS.MODULE_NAME, "enableForNpc")) {
			flagCategorys = initCategoriesForNPC(flagCategorys);
		} else if (actorType === "vehicle" && game.settings.get(CONSTANTS.MODULE_NAME, "enableForVehicle")) {
			flagCategorys = initCategoriesForVehicle(flagCategorys);
		} else {
			// Cannot happened
			// warn(
			// 	i18nFormat(`${CONSTANTS.MODULE_NAME}.dialogs.warn.actortypeisnotsupported`, { actorType: actorType }),
			// 	true
			// );
			return;
		}

		// Little trick for filter the undefined values
		// https://stackoverflow.com/questions/51624641/how-to-filter-records-based-on-the-status-value-in-javascript-object
		const filterJSON = Object.keys(flagCategorys)
			.filter(function (key) {
				const entry = flagCategorys[key];
				return entry !== undefined && entry !== null && entry.label;
			})
			.reduce((res, key) => ((res[key] = flagCategorys[key]), res), {});

		this.customCategorys = duplicateExtended(filterJSON);
		this.applySortKey();
	}

	addInventoryFunctions(
		html: JQuery<HTMLElement>,
		actorType: string,
		targetCssInventoryPlus: string,
		inventoryPlusItemTypeCollection: InventoryPlusItemType[]
	) {
		if (!actorType || !html) {
			// Cannot happened
			return;
		}

		/*
		 *  add remove default categories
		 */
		const flagDisableDefaultCategories = true; // IS ALWAYS FALSE FOR NOW
		const labelDialogDisableDefaultCategories = flagDisableDefaultCategories
			? i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.reenabledefaultcategories`)
			: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.removedefaultcategories`);

		const iconClass = flagDisableDefaultCategories ? `fa-plus-square` : `fa-minus-square`;

		const isVariantEncumbranceEnabled =
			game.modules.get("variant-encumbrance-dnd5e")?.active &&
			game.settings.get(CONSTANTS.MODULE_NAME, "enableIntegrationWithVariantEncumbrance");
		const isBulked = isVariantEncumbranceEnabled
			? isVariantEncumbranceEnabled && game.settings.get("variant-encumbrance-dnd5e", "enableBulkSystem")
			: false;

		// ONly gm can do this

		if (game.user?.isGM && !game.settings.get(CONSTANTS.MODULE_NAME, "hideButtonDefaultCategories")) {
			const status = flagDisableDefaultCategories
				? i18n(`inventory-plus.inv-plus-dialog.reenabledefaultcategories`)
				: i18n(`inventory-plus.inv-plus-dialog.removedefaulcategorieswarnmessagedisable`);
			const msg = i18nFormat(`inventory-plus.inv-plus-dialog.removedefaulcategorieswarnmessage`, {
				status: status,
			});
			const removeDefaultCategoriesBtn = $(
				`<a class="custom-category"><i class="fas ${iconClass}"></i>${labelDialogDisableDefaultCategories}</a>`
			).click(async (ev) => {
				ev.preventDefault();
				const template = await renderTemplate(
					`modules/${CONSTANTS.MODULE_NAME}/templates/restoreDefaultCategoriesDialog.hbs`,
					{
						msg: msg,
					}
				);
				const d = new Dialog({
					title: labelDialogDisableDefaultCategories,
					content: template,
					buttons: {
						accept: {
							icon: '<i class="fas fa-check"></i>',
							label: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.accept`),
							callback: async (html: HTMLElement | JQuery<HTMLElement>) => {
								const f =
									flagDisableDefaultCategories && String(flagDisableDefaultCategories) === "true"
										? true
										: false;
								if (!f) {
									if (actorType === "character") {
										for (const catType of defaultSectionsForCharacters) {
											this.removeCategory(catType);
										}
									} else if (
										actorType === "npc" &&
										game.settings.get(CONSTANTS.MODULE_NAME, "enableForNpc")
									) {
										for (const catType of defaultSectionsForNPC) {
											this.removeCategory(catType);
										}
									} else if (
										actorType === "vehicle" &&
										game.settings.get(CONSTANTS.MODULE_NAME, "enableForVehicle")
									) {
										for (const catType of defaultSectionsForVehicle) {
											this.removeCategory(catType);
										}
									} else {
										// Cannot happened
										// warn(
										// 	i18nFormat(
										// 		`${CONSTANTS.MODULE_NAME}.dialogs.warn.actortypeisnotsupported`,
										// 		{ actorType: actorType }
										// 	),
										// 	true
										// );
										return;
									}
								} else {
									if (actorType === "character") {
										this.customCategorys = adjustCustomCategoriesForCharacter(this.customCategorys);
									} else if (
										actorType === "npc" &&
										game.settings.get(CONSTANTS.MODULE_NAME, "enableForNpc")
									) {
										this.customCategorys = adjustCustomCategoriesForNPC(this.customCategorys);
									} else if (
										actorType === "vehicle" &&
										game.settings.get(CONSTANTS.MODULE_NAME, "enableForVehicle")
									) {
										this.customCategorys = adjustCustomCategoriesForVehicle(this.customCategorys);
									} else {
										// Cannot happened
										// warn(
										// 	i18nFormat(
										// 		`${CONSTANTS.MODULE_NAME}.dialogs.warn.actortypeisnotsupported`,
										// 		{ actorType: actorType }
										// 	),
										// 	true
										// );
										return;
									}
									this.saveCategorys();
								}
							},
						},
						cancel: {
							icon: '<i class="fas fa-times"></i>',
							label: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.cancel`),
						},
					},
					default: "cancel",
				});
				d.render(true);
			});
			html.find(`.${targetCssInventoryPlus} .filter-list`).prepend(removeDefaultCategoriesBtn);
		}

		/*
		 *  create custom category
		 */
		const addCategoryBtn = $(
			`<a class="custom-category"><i class="fas fa-plus"></i>${i18n(
				`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.addcustomcategory`
			)}</a>`
		).click(async (ev) => {
			ev.preventDefault();
			const explicitTypesFromList = inventoryPlusItemTypeCollection.filter((t) => {
				return t.isInventory;
			});
			const template = await renderTemplate(`modules/${CONSTANTS.MODULE_NAME}/templates/categoryDialog.hbs`, {
				explicitTypes: explicitTypesFromList,
				enabledBulk: isBulked,
			});
			const d = new Dialog({
				title: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.creatingnewinventorycategory`),
				content: template,
				buttons: {
					accept: {
						icon: '<i class="fas fa-check"></i>',
						label: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.accept`),
						callback: async (html: HTMLElement | JQuery<HTMLElement>) => {
							const input = (<JQuery<HTMLElement>>html).find("input");
							const selectExplicitTypes = $(
								<HTMLElement>(<JQuery<HTMLElement>>html).find('select[name="explicitTypes"')[0]
							);
							this.createCategory(input, selectExplicitTypes, inventoryPlusItemTypeCollection); // ,selectDefaultType
						},
					},
					cancel: {
						icon: '<i class="fas fa-times"></i>',
						label: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.cancel`),
					},
				},
				render: (html: HTMLElement | JQuery<HTMLElement>) => {
					$(<HTMLElement>(<JQuery<HTMLElement>>html).find(`select[name="explicitTypes"]`)[0])
						//@ts-ignore
						.SumoSelect({
							placeholder: "Select item inventory type...",
							triggerChangeCombined: true,
						});
				},
				default: "cancel",
			});
			d.render(true);
		});
		html.find(`.${targetCssInventoryPlus} .filter-list`).prepend(addCategoryBtn);

		/*
		 *  add removal function
		 */
		// const createBtns: JQuery<HTMLElement> = html.find(`.${targetCssInventoryPlus} .item-create`);
		// for (const createBtn of createBtns) {
		//   const type = <string>createBtn.dataset.type;
		//   // Filter for only invenotry items
		//   // const dnd5eItems = ['weapon', 'equipment', 'consumable', 'tool', 'backpack', 'loot'];
		//   // if (physicalItems.indexOf(type) === -1) {
		//   //const parent = <ParentNode>createBtn.parentNode;
		//   const createItemBtn = `<a class="item-control item-create"
		//     title="${i18n('DND5E.ItemCreate')}"
		//     data-type="${type}" data-categoryid="${categoryId}">`;
		//   $(createBtn).html(createItemBtn);
		//@ts-ignore
		//parent.innerHTML = '';
		//$(parent).append(manageCategoryBtn);
		// }
		// }

		html.find(`.${targetCssInventoryPlus} a.item-create`).each((i, el) => {
			const type = <string>el.dataset.type;

			let categoryText = <string>el.parentElement?.parentElement?.querySelector("h3")?.innerText;
			let headerElement: JQuery<HTMLElement> | undefined = undefined;
			if (categoryText) {
				headerElement = $(<HTMLElement>el.parentElement?.parentElement?.querySelector("h3"));
			} else {
				headerElement = $(<HTMLElement>el.parentElement?.parentElement?.parentElement?.querySelector("h3"));
				categoryText = <string>el.parentElement?.parentElement?.parentElement?.querySelector("h3")?.innerText;
			}
			if (!categoryText) {
				warn(`No category text is been founded open a issue on the github project`);
			}
			const categoryId = <string>retrieveCategoryIdFromLabel(this.customCategorys, headerElement, categoryText);

			$(el).data("type", type);
			$(el).attr("data-type", type);
			$(el).attr("data-categoryid", categoryId);

			if (categoryId) {
				if (!headerElement.attr("data-categoryid")) {
					headerElement.attr("data-categoryid", categoryId);
				}
			}

			const removeCategoryBtnS = `<a class="item-control remove-category"
          title="${i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.deletecategory`)}"
          data-type="${type}" data-categoryid="${categoryId}">
          <i class="fas fa-minus"></i>${i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.deletecategoryprefix`)}</a>`;

			const linkElRemoveCategory = $(removeCategoryBtnS);
			$(el).after(linkElRemoveCategory);

			linkElRemoveCategory.on("click", async (ev) => {
				ev.preventDefault();
				//const catType = <string>ev.target.dataset.type || <string>ev.currentTarget.dataset.type || <string>type;
				let catType = <string>ev.target.dataset.categoryid || <string>ev.currentTarget.dataset.categoryid;
				if (!catType) {
					let categoryText = <string>el.parentElement?.parentElement?.querySelector("h3")?.innerText;
					let headerElement: JQuery<HTMLElement> | undefined = undefined;
					if (categoryText) {
						headerElement = $(<HTMLElement>el.parentElement?.parentElement?.querySelector("h3"));
					} else {
						headerElement = $(
							<HTMLElement>el.parentElement?.parentElement?.parentElement?.querySelector("h3")
						);
						categoryText = <string>(
							el.parentElement?.parentElement?.parentElement?.querySelector("h3")?.innerText
						);
					}
					if (!categoryText) {
						warn(`No category text is been founded open a issue on the github project`);
					}
					const categoryId = <string>(
						retrieveCategoryIdFromLabel(this.customCategorys, headerElement, categoryText)
					);
					catType = categoryId;
					if (categoryId) {
						if (!headerElement.attr("data-categoryid")) {
							headerElement.attr("data-categoryid", categoryId);
						}
					}
				}
				if (!catType) {
					catType = <string>ev.target.dataset.type || <string>ev.currentTarget.dataset.type || <string>type;
				}
				const category = <Category>this.customCategorys[catType];
				const categoryItems = API.getItemsFromCategory(this.actor, catType, this.customCategorys);
				if (categoryItems && categoryItems.length > 0) {
					warn(
						i18nFormat(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.deletecategorycheckitems`, {
							categoryName: i18n(category.label),
						}),
						true
					);
					return;
				}
				const categoryName = this.customCategorys[type]?.label
					? i18n(<string>this.customCategorys[type]?.label)
					: "Unknown";
				const status = flagDisableDefaultCategories
					? i18n(`inventory-plus.inv-plus-dialog.removedefaulcategorieswarnmessagereenable`)
					: i18n(`inventory-plus.inv-plus-dialog.removedefaulcategorieswarnmessagedisable`);
				const msg = i18nFormat(`inventory-plus.inv-plus-dialog.removedefaulcategorieswarnmessage`, {
					status: status,
				});
				const msgDeleteCategory = i18nFormat(`inventory-plus.inv-plus-dialog.confirmationdeletecategory`, {
					categoryName: categoryName,
				});
				const msgBackupActor = i18n(`inventory-plus.inv-plus-dialog.removedefaulcategorieswarnmessage2`);
				const template = await renderTemplate(
					`modules/${CONSTANTS.MODULE_NAME}/templates/removeCategoryDialog.hbs`,
					{
						msg: msg,
						msgDeleteCategory: msgDeleteCategory,
						msgBackupActor: msgBackupActor,
					}
				);
				const d = new Dialog({
					title: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.deletecategory`),
					content: template,
					buttons: {
						accept: {
							icon: '<i class="fas fa-check"></i>',
							label: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.accept`),
							callback: async (html: HTMLElement | JQuery<HTMLElement>) => {
								this.removeCategory(catType);
							},
						},
						cancel: {
							icon: '<i class="fas fa-times"></i>',
							label: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.cancel`),
						},
					},
					default: "cancel",
				});
				d.render(true);
			});

			const createItemBtn = `<a class="item-control item-create-2"
          title="${i18n("DND5E.ItemCreate")}"
          data-type="${type}" data-categoryid="${categoryId}">
          <i class="fas fa-plus"></i> ${i18n("DND5E.Add")}</a>`;

			const linkElItemCreate2 = $(createItemBtn);
			$(el).after(linkElItemCreate2);
			linkElItemCreate2.on("click", (ev) => {
				ev.preventDefault();
				// let catType = <string>ev.target.dataset.type || <string>ev.currentTarget.dataset.type;
				let catType = <string>ev.target.dataset.categoryid || <string>ev.currentTarget.dataset.categoryid;
				if (!catType) {
					let categoryText = <string>el.parentElement?.parentElement?.querySelector("h3")?.innerText;
					let headerElement: JQuery<HTMLElement> | undefined = undefined;
					if (categoryText) {
						headerElement = $(<HTMLElement>el.parentElement?.parentElement?.querySelector("h3"));
					} else {
						headerElement = $(
							<HTMLElement>el.parentElement?.parentElement?.parentElement?.querySelector("h3")
						);
						categoryText = <string>(
							el.parentElement?.parentElement?.parentElement?.querySelector("h3")?.innerText
						);
					}
					if (!categoryText) {
						warn(`No category text is been founded open a issue on the github project`);
					}
					const categoryId = <string>(
						retrieveCategoryIdFromLabel(this.customCategorys, headerElement, categoryText)
					);
					catType = categoryId;
					if (categoryId) {
						if (!headerElement.attr("data-categoryid")) {
							headerElement.attr("data-categoryid", categoryId);
						}
					}
				}
				if (!catType) {
					catType = <string>$(ev.currentTarget).parent().find(".remove-category")[0]?.dataset.categoryid;
				}
				if (!catType) {
					catType = <string>ev.target.dataset.type || <string>ev.currentTarget.dataset.type;
				}
				if (!catType) {
					catType = <string>$(ev.currentTarget).parent().find(".remove-category")[0]?.dataset.type;
				}
				this._onItemCreate(ev, catType);
			});
		});

		html.find(`.${targetCssInventoryPlus} a.item-create`).css("display", "none");

		html.find(`.${targetCssInventoryPlus} a.quick-insert-link`).each((i, el) => {
			//let catType = <string>el.attributes["data-type"];
			//if (!catType) {
			//	catType = <string>$(el).parent().find(".remove-category")[0]?.dataset.type;
			//}
			let catType = <string>el.attributes["data-categoryid"];
			if (!catType) {
				let categoryText = <string>el.parentElement?.parentElement?.querySelector("h3")?.innerText;
				let headerElement: JQuery<HTMLElement> | undefined = undefined;
				if (categoryText) {
					headerElement = $(<HTMLElement>el.parentElement?.parentElement?.querySelector("h3"));
				} else {
					headerElement = $(<HTMLElement>el.parentElement?.parentElement?.parentElement?.querySelector("h3"));
					categoryText = <string>(
						el.parentElement?.parentElement?.parentElement?.querySelector("h3")?.innerText
					);
				}
				if (!categoryText) {
					warn(`No category text is been founded open a issue on the github project`);
				}
				const categoryId = <string>(
					retrieveCategoryIdFromLabel(this.customCategorys, headerElement, categoryText)
				);
				catType = categoryId;
				if (categoryId) {
					if (!headerElement.attr("data-categoryid")) {
						headerElement.attr("data-categoryid", categoryId);
					}
				}
			}
			if (!catType) {
				catType = <string>$(el).parent().find(".remove-category")[0]?.dataset.categoryid;
			}
			if (!catType) {
				catType = <string>el.attributes["data-type"];
			}
			if (!catType) {
				catType = <string>$(el).parent().find(".remove-category")[0]?.dataset.type;
			}

			let itemType = <string>el.attributes["data-type"];
			if (!itemType) {
				itemType = <string>$(el).parent().find(".remove-category")[0]?.dataset.type;
			}

			$(el).data("type", itemType);
			$(el).attr("data-type", itemType);
			$(el).attr("data-categoryid", catType);
		});

		/*
		 *  add extra header functions
		 */

		const targetCss = `.${targetCssInventoryPlus} .${getCSSName("sub-header")}`;
		const headers = html.find(targetCss);
		for (const headerTmp of headers) {
			const header = <JQuery<HTMLElement>>$(headerTmp);
			const type = <string>(<HTMLElement>header.find(".item-control")[0]).dataset.type;

			const headerElement = $(<HTMLElement>headerTmp.querySelector("h3"));
			const categoryText = <string>headerTmp.querySelector("h3")?.innerText;
			const categoryId = <string>retrieveCategoryIdFromLabel(this.customCategorys, headerElement, categoryText);
			if (categoryId) {
				if (!headerElement.attr("data-categoryid")) {
					headerElement.attr("data-categoryid", categoryId);
				}
			}

			const extraStuff = $('<div class="inv-plus-stuff flexrow"></div>');
			header.find("h3").after(extraStuff);

			if (this.customCategorys[categoryId] === undefined) {
				warn(
					i18nFormat(`${CONSTANTS.MODULE_NAME}.dialogs.warn.nocategoryfoundbytype`, {
						type: categoryId ?? categoryText,
					})
				);
				continue;
			}

			const currentCategory = <Category>this.customCategorys[categoryId];
			if (!currentCategory.explicitTypes || currentCategory.explicitTypes.length === 0) {
				currentCategory.explicitTypes = inventoryPlusItemTypeCollection.filter((t) => {
					return t.isInventory;
				});
			}
			// ===================
			// toggle item visibility
			// ===================
			const arrow = currentCategory?.collapsed === true ? "right" : "down";
			const toggleBtn = $(`<a class="toggle-collapse"><i class="fas fa-caret-${arrow}"></i></a>`).click((ev) => {
				ev.preventDefault();
				currentCategory.collapsed = <boolean>!currentCategory?.collapsed;
				this.saveCategorys();
			});
			header.find("h3").before(toggleBtn);
			// ===================
			// reorder category
			// ===================
			if (this.getLowestSortFlag() !== currentCategory.sortFlag) {
				const upBtn = $(
					`<a class="inv-plus-stuff shuffle-up" title="Move category up"><i class="fas fa-chevron-up"></i></a>`
				).click((ev) => {
					ev.preventDefault();
					this.changeCategoryOrder(categoryId, true);
				});
				extraStuff.append(upBtn);
			}
			if (this.getHighestSortFlag() !== currentCategory.sortFlag) {
				const downBtn = $(
					`<a class="inv-plus-stuff shuffle-down" title="Move category down"><i class="fas fa-chevron-down"></i></a>`
				).click((ev) => {
					ev.preventDefault();
					this.changeCategoryOrder(categoryId, false);
				});
				extraStuff.append(downBtn);
			}
			// ================
			// edit category
			// ===============
			const editCategoryBtn = $(
				`<a class="inv-plus-stuff customize-category" 
				data-type="${type}" data-categoryid="${categoryId}">
				<i class="fas fa-edit"></i>
				</a>`
			).click(async (ev) => {
				ev.preventDefault();
				// const catTypeTmp = <string>ev.target.dataset.type || <string>ev.currentTarget.dataset.type;

				const headerElement = $(<HTMLElement>headerTmp.querySelector("h3"));
				const categoryText = <string>headerTmp.querySelector("h3")?.innerText;
				const categoryId = <string>(
					retrieveCategoryIdFromLabel(this.customCategorys, headerElement, categoryText)
				);
				const catTypeTmp = categoryId;
				if (categoryId) {
					if (!headerElement.attr("data-categoryid")) {
						headerElement.attr("data-categoryid", categoryId);
					}
				}

				const explicitTypesFromList = inventoryPlusItemTypeCollection.filter((t) => {
					return t.isInventory;
				});
				const currentCategoryTmp = duplicateExtended(<Category>this.customCategorys[catTypeTmp]);
				currentCategoryTmp.label = i18n(currentCategoryTmp.label);
				currentCategoryTmp.explicitTypes = explicitTypesFromList; // 2022-10-10
				currentCategoryTmp.enabledBulk = isVariantEncumbranceEnabled && isBulked;

				const template = await renderTemplate(
					`modules/${CONSTANTS.MODULE_NAME}/templates/categoryDialog.hbs`,
					currentCategoryTmp
				);
				const d = new Dialog({
					title: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.editinventorycategory`),
					content: template,
					buttons: {
						accept: {
							icon: '<i class="fas fa-check"></i>',
							label: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.accept`),
							callback: async (html: HTMLElement | JQuery<HTMLElement>) => {
								const inputs = (<JQuery<HTMLElement>>html).find("input");
								for (const input of inputs) {
									const value = input.type === "checkbox" ? input.checked : input.value;
									if (input.dataset.dtype === "Number") {
										const valueN = Number(value) > 0 ? Number(value) : 0;
										currentCategory[input.name] = valueN;
									} else {
										currentCategory[input.name] = value;
									}
								}

								const currentTypeSelectedS = <string[]>(
									$(
										<HTMLElement>(<JQuery<HTMLElement>>html).find('select[name="explicitTypes"')[0]
									)?.val()
								);
								if (!currentTypeSelectedS || currentTypeSelectedS.length === 0) {
									currentCategory.explicitTypes = [];
								} else if (currentTypeSelectedS.length === 1 && !currentTypeSelectedS[0]) {
									const newArr = currentCategory.explicitTypes.map((obj: InventoryPlusItemType) => {
										return { ...obj, isSelected: false };
									});
									currentCategory.explicitTypes = newArr;
								} else {
									const newArr = currentCategory.explicitTypes.map((obj: InventoryPlusItemType) => {
										if (currentTypeSelectedS.includes(obj.id)) {
											return { ...obj, isSelected: true };
										} else {
											return { ...obj, isSelected: false };
										}
									});
									currentCategory.explicitTypes = newArr;
								}
								this.customCategorys[catTypeTmp] = currentCategory;
								this.saveCategorys();
							},
						},
						cancel: {
							icon: '<i class="fas fa-times"></i>',
							label: i18n(`${CONSTANTS.MODULE_NAME}.inv-plus-dialog.cancel`),
						},
					},
					render: (html: HTMLElement | JQuery<HTMLElement>) => {
						$(<HTMLElement>(<JQuery<HTMLElement>>html).find(`select[name="explicitTypes"]`)[0])
							//@ts-ignore
							.SumoSelect({
								placeholder: "Select item inventory type...",
								triggerChangeCombined: true,
							});
					},
					default: "cancel",
				});
				d.render(true);
			});
			extraStuff.append(editCategoryBtn);

			// hide collapsed category items
			if (currentCategory.collapsed === true) {
				header.next().hide();
			}

			let icon = ``;

			// show type of category
			const enabledExplicitTypes = currentCategory.explicitTypes.filter((i) => {
				return i.isSelected;
			});
			if (enabledExplicitTypes.length > 0) {
				for (const explicitType of enabledExplicitTypes) {
					// None
					// if(!explicitType.id || explicitType.id === ''){
					//   icon = icon+`<i class="fas fa-times-circle"></i>`;
					// }
					// Weapon
					if (explicitType.id === "weapon") {
						icon = icon + `<i class="fas fa-bomb"></i>`;
					}
					// Equipment
					if (explicitType.id === "equipment") {
						icon = icon + `<i class="fas fa-vest"></i>`;
					}
					// Consumable
					if (explicitType.id === "consumable") {
						icon = icon + `<i class="fas fa-hamburger"></i>`;
					}
					// Tool
					if (explicitType.id === "tool") {
						icon = icon + `<i class="fas fa-scroll"></i>`;
					}
					// Backpack
					if (explicitType.id === "backpack") {
						icon = icon + `<i class="fas fa-toolbox"></i>`;
					}
					// Loot
					if (explicitType.id === "loot") {
						icon = icon + `<i class="fas fa-box"></i>`;
					}
				}
			}

			/*
			if (currentCategory.ignoreWeight || currentCategory.ignoreBulk) {
				icon = icon + `<i class="fas fa-feather"></i>`;
			} else if (currentCategory.ownWeight > 0 || currentCategory.ownBulk > 0) {
				icon = icon + `<i class="fas fa-weight-hanging"></i>`;
			} else if (currentCategory.maxWeight > 0 || currentCategory.maxBulk > 0) {
				icon = icon + `<i class="fas fa-balance-scale-right"></i>`;
			}
			*/
			const weight = <number>this.getCategoryItemWeight(categoryId);
			let bulkWeightS = "";
			let weightUnit = game.settings.get("dnd5e", "metricWeightUnits")
				? game.i18n.localize("DND5E.AbbreviationKgs")
				: game.i18n.localize("DND5E.AbbreviationLbs");

			const isVariantEncumbranceEnabled =
				game.modules.get("variant-encumbrance-dnd5e")?.active &&
				game.settings.get(CONSTANTS.MODULE_NAME, "enableIntegrationWithVariantEncumbrance");
			const isBulked = isVariantEncumbranceEnabled
				? isVariantEncumbranceEnabled && game.settings.get("variant-encumbrance-dnd5e", "enableBulkSystem")
				: false;

			if (currentCategory.ignoreWeight) {
				icon = icon + `<i class="fas fa-feather"></i>`;
			} else if (currentCategory.ownWeight > 0) {
				icon = icon + `<i class="fas fa-weight-hanging"></i>`;
			} else if (currentCategory.maxWeight > 0) {
				icon = icon + `<i class="fas fa-balance-scale-right"></i>`;
			}
			if (isBulked) {
				if (currentCategory.ignoreBulk) {
					icon = icon + `<i class="fas fa-feather-alt"></i>`;
				} else if (currentCategory.ownBulk > 0) {
					icon = icon + `<i class="fas fa-bold"></i>`;
				} else if (currentCategory.maxBulk > 0) {
					icon = icon + `<i class="fas fa-balance-scale-left"></i>`;
				}
			}

			let bulkUnit = "bulk";
			let weigthBulk = 0;
			if (isBulked) {
				bulkUnit = <string>game.settings.get("variant-encumbrance-dnd5e", "unitsBulk");
				weightUnit = game.settings.get("dnd5e", "metricWeightUnits")
					? <string>game.settings.get("variant-encumbrance-dnd5e", "unitsMetric")
					: <string>game.settings.get("variant-encumbrance-dnd5e", "units");
				if (isBulked) {
					//@ts-ignore
					weigthBulk = <number>this.getCategoryItemBulk(type);
					//game.modules.get('variant-encumbrance-dnd5e')?.api.convertLbToBulk(weight) || 0;
					bulkWeightS = String(weigthBulk + " " + bulkUnit);
				}
			}

			let weightValue = "";
			if (currentCategory.ignoreWeight) {
				if (!isBulked) {
					if (currentCategory.maxWeight > 0) {
						if (currentCategory.ownWeight > 0) {
							if (bulkWeightS) {
								weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}][${bulkWeightS}]`;
							} else {
								weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
							}
						} else {
							weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})`;
						}
					} else {
						if (currentCategory.ownWeight > 0) {
							if (bulkWeightS) {
								weightValue = `(${weight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}][${bulkWeightS}]`;
							} else {
								weightValue = `(${weight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
							}
						} else {
							weightValue = `(${weight} ${weightUnit})`;
						}
					}
				} else {
					// BULKED
					if (currentCategory.maxBulk > 0) {
						if (currentCategory.ownBulk > 0) {
							weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
						} else {
							weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})`;
						}
					} else {
						if (currentCategory.ownBulk > 0) {
							weightValue = `(${weigthBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
						} else {
							// weightValue = `(${weigthBulk} ${bulkUnit})`;
							if (currentCategory.maxWeight > 0) {
								if (currentCategory.ownWeight > 0) {
									if (bulkWeightS) {
										weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}][${bulkWeightS}]`;
									} else {
										weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
									}
								} else {
									weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})`;
								}
							} else {
								if (currentCategory.ownWeight > 0) {
									if (bulkWeightS) {
										weightValue = `(${weight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}][${bulkWeightS}]`;
									} else {
										weightValue = `(${weight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
									}
								} else {
									weightValue = `(${weigthBulk} ${bulkUnit})`;
								}
							}
						}
					}
				}
			} else if (currentCategory.ownWeight > 0) {
				if (!isBulked) {
					if (currentCategory.maxWeight > 0) {
						if (bulkWeightS) {
							weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}][${bulkWeightS}]`;
						} else {
							weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
						}
					} else {
						if (bulkWeightS) {
							weightValue = `(${weight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}][${bulkWeightS}]`;
						} else {
							weightValue = `(${weight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
						}
					}
				} else {
					// BULKED
					if (currentCategory.ownBulk > 0) {
						if (currentCategory.maxBulk > 0) {
							weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
						} else {
							weightValue = `(${weigthBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
						}
					} else {
						if (currentCategory.maxBulk > 0) {
							if (bulkWeightS) {
								weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
							} else {
								weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
							}
						} else {
							if (bulkWeightS) {
								weightValue = `(${weigthBulk} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}][${bulkWeightS}]`;
							} else {
								weightValue = `(${weight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
							}
						}
					}
				}
			} else if (currentCategory.maxWeight > 0) {
				if (!isBulked) {
					if (currentCategory.ownBulk > 0) {
						if (bulkWeightS) {
							weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
						} else {
							weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
						}
					} else if (currentCategory.ownWeight > 0) {
						if (bulkWeightS) {
							weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
						} else {
							weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
						}
					} else {
						weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})`;
					}
				} else {
					// BULKED
					if (currentCategory.maxBulk > 0) {
						if (currentCategory.ownBulk > 0) {
							weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
						} else {
							weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})`;
						}
					} else {
						if (currentCategory.ownBulk > 0) {
							if (bulkWeightS) {
								weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
							} else {
								weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})[${currentCategory.ownWeight} ${weightUnit}]`;
							}
						} else {
							if (bulkWeightS) {
								weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})`;
							} else {
								weightValue = `(${weight}/${currentCategory.maxWeight} ${weightUnit})`;
							}
						}
					}
				}
			}
			// BULKED
			else if (isBulked) {
				if (currentCategory.ownBulk > 0) {
					if (currentCategory.maxBulk > 0) {
						weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
					} else {
						weightValue = `(${weigthBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
					}
				} else if (currentCategory.maxBulk > 0) {
					if (currentCategory.ownBulk > 0) {
						weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})[${currentCategory.ownBulk} ${bulkUnit}]`;
					} else {
						weightValue = `(${weigthBulk}/${currentCategory.maxBulk} ${bulkUnit})`;
					}
				}
			}
			const weightString = $(`<label class="category-weight"> ${icon} ${weightValue}</label>`);
			header.find("h3").append(weightString);
		}
	}

	prepareInventory(actor: Actor, inventory: Category[]) {
		const sections = <Record<string, Category>>duplicateExtended(this.customCategorys);

		for (const id in sections) {
			(<Category>sections[id]).items = [];
		}

		for (const section of inventory) {
			for (const item of <Item[]>section.items) {
				let sectionItemType = this.getItemType(item);
				let sectionId = <string>(
					retrieveSectionIdFromItemType(actor.type, sections, item.type, section, sectionItemType)
				);
				/*
				//let sectionId = <string>retrieveSectionIdFromItemType(actor.type, section, undefined);
				let sectionId = <string>retrieveSectionIdFromItemType(actor.type, section, type);
				if (sectionId === undefined) {
					if (sections[type]) {
						sectionId = type;
					} else {
						sectionId = item.type;
					}
				}
				*/
				if (sections[sectionId]) {
					(<Category>sections[sectionId]).items?.push(item);
					if (!sections[sectionId]?.customId) {
						(<Category>sections[sectionId]).customId = sectionId;
					}
				}
			}
		}

		// TODO WHY THIS HIDE THE WEIGHT LABEL OF ITEMS ????
		/*
    const items = actor.items.contents;
    for (const section of inventory) {
      for (const item of <Item[]>items) {
        if(!item){
          continue;
        }
        let type = this.getItemType(item.system);
        if (sections[type] === undefined) {
          type = item.type;
        }
        if(!sections[type] &&
          section.explicitTypes?.length > 0 &&
          section.explicitTypes[0]?.id !== ''){
          type = section.explicitTypes[0];
        }
        if (sections[type]) {
          (<Category>sections[type]).items?.push(duplicateExtended(item));
        }else{
          warn(`Cannot retrieve a category for the type ${type}, for item ${item.name} make sure to create at least one category with that explicit type`);
        }
      }
    }
    */

		// sort items within sections
		for (const id in sections) {
			const section = <Category>sections[id];
			section.items?.sort((a, b) => {
				//@ts-ignore
				return a.sort - b.sort;
			});
		}
		return sections;
	}

	createCategory(
		inputs,
		selectExplicitTypes: JQuery<HTMLElement>,
		inventoryPlusItemTypeCollection: InventoryPlusItemType[]
	) {
		// ,selectDefaultType:JQuery<HTMLElement>
		const newCategory = new Category();

		for (const input of inputs) {
			const value: string = input.type === "checkbox" ? input.checked : input.value;
			if (input.dataset.dtype === "Number") {
				const valueN = Number(value) > 0 ? Number(value) : 0;
				newCategory[input.name] = valueN;
			} else {
				newCategory[input.name] = value;
			}
		}

		const typesSelected = <string[]>selectExplicitTypes.val();
		const explicitTypesFromListTmp = <InventoryPlusItemType[]>[];
		const explicitTypesFromList = inventoryPlusItemTypeCollection.filter((t) => {
			const t2 = duplicateExtended(t);
			if (t2.isInventory && typesSelected.includes(t2.id)) {
				t2.isSelected = true;
				explicitTypesFromListTmp.push(t2);
			}
		});

		newCategory.explicitTypes = explicitTypesFromListTmp;

		if (newCategory.label === undefined || newCategory.label === "" || newCategory.label === null) {
			error(`Could not create the category as no name was specified`, true);
			return;
		}

		const categoryId = retrieveCategoryIdFromLabel(this.customCategorys, undefined, newCategory.label);
		if (categoryId) {
			error(`Could not create the category a category with the same name is already present`, true);
			return;
		}

		const key = this.generateCategoryId();
		if (this.customCategorys[key]) {
			error(`Could not create the category a category with the same id is already present`, true);
			return;
		}

		newCategory.customId = key;
		newCategory.dataset = { type: key };
		newCategory.collapsed = false;
		newCategory.sortFlag = this.getHighestSortFlag() + 1000;
		this.customCategorys[key] = newCategory;
		this.saveCategorys();
	}

	async removeCategory(catType: string) {
		const changedItems: ItemData[] = [];
		const items = API.getItemsFromCategory(this.actor, catType, this.customCategorys);
		for (const itemEntity of items) {
			//for (const i of this.actor.items) {
			const type = this.getItemType(itemEntity);
			if (type === catType) {
				//await item.unsetFlag(CONSTANTS.MODULE_NAME, InventoryPlusFlag.CATEGORY);
				changedItems.push(<any>{
					_id: <string>itemEntity.id,
					flags: {
						"inventory-plus": null,
					},
				});
			}
		}
		//@ts-ignore
		await this.actor.updateEmbeddedDocuments("Item", changedItems);

		delete this.customCategorys[catType];
		const deleteKey = `-=${catType}`;
		await this.actor.setFlag(CONSTANTS.MODULE_NAME, InventoryPlusFlags.CATEGORYS, { [deleteKey]: null });
	}

	changeCategoryOrder(movedType, up) {
		let targetType = movedType;
		let currentSortFlag = 0;
		if (!up) currentSortFlag = 999999999;
		for (const id in this.customCategorys) {
			const currentCategory = <Category>this.customCategorys[id];
			if (!currentCategory.sortFlag || !this.customCategorys[movedType]?.sortFlag) {
				currentCategory.sortFlag = currentSortFlag;
				setProperty(<any>this.customCategorys[movedType], "sortFlag", <number>currentSortFlag);
			}
			if (up) {
				if (
					id !== movedType &&
					currentCategory.sortFlag < (<Category>this.customCategorys[movedType]).sortFlag &&
					currentCategory.sortFlag > currentSortFlag
				) {
					targetType = id;
					currentSortFlag = currentCategory.sortFlag;
				}
			} else {
				if (
					id !== movedType &&
					currentCategory.sortFlag > (<Category>this.customCategorys[movedType]).sortFlag &&
					currentCategory.sortFlag < currentSortFlag
				) {
					targetType = id;
					currentSortFlag = currentCategory.sortFlag;
				}
			}
		}

		if (movedType !== targetType) {
			const oldMovedSortFlag = this.customCategorys[movedType]?.sortFlag;
			const newMovedSortFlag = currentSortFlag;

			(<Category>this.customCategorys[movedType]).sortFlag = newMovedSortFlag;
			(<Category>this.customCategorys[targetType]).sortFlag = <number>oldMovedSortFlag;
			this.applySortKey();
			this.saveCategorys();
		}
	}

	applySortKey() {
		const sortedCategorys = {};

		const keys = Object.keys(this.customCategorys);
		keys.sort((a, b) => {
			return <number>this.customCategorys[a]?.sortFlag - <number>this.customCategorys[b]?.sortFlag;
		});
		for (const key of keys) {
			sortedCategorys[key] = this.customCategorys[key];
		}
		this.customCategorys = sortedCategorys;
	}

	getHighestSortFlag() {
		let highest = 0;

		for (const id in this.customCategorys) {
			const cat = <Category>this.customCategorys[id];
			if (!cat) {
				warn(`Can't find the category with id '${id}'`, true);
				return highest;
			}
			if (cat.sortFlag > highest) {
				highest = cat.sortFlag;
			}
		}

		return highest;
	}

	getLowestSortFlag() {
		let lowest = 999999999;

		for (const id in this.customCategorys) {
			const cat = <Category>this.customCategorys[id];

			if (cat.sortFlag < lowest) {
				lowest = cat.sortFlag;
			}
		}

		return lowest;
	}

	generateCategoryId() {
		let id = "";
		let iterations = 100;
		do {
			id = Math.random().toString(36).substring(7);
			iterations--;
		} while (this.customCategorys[id] !== undefined && iterations > 0 && id.length >= 5);

		return id;
	}

	getItemType(item: Item) {
		let type = getProperty(item, `flags.${CONSTANTS.MODULE_NAME}.${InventoryPlusFlags.CATEGORY}`);
		// if (!type) {
		// 	type = getProperty(item, `flags.${CONSTANTS.MODULE_NAME}.${InventoryPlusFlags.CATEGORY}`);
		// }
		if (type === undefined || this.customCategorys[type] === undefined) {
			type = item.type;
		}
		// 0.5.4 only thing i touched, this broke everything ????
		//if (this.customCategorys[type] && this.customCategorys[type]?.dataset.type !== item.type) {
		//  return item.type;
		//}
		return type;
	}

	getCategoryItemWeight(type: string) {
		let totalCategoryWeight = 0;
		const items = <Item[]>API.getItemsFromCategory(this.actor, type, this.customCategorys);
		if (
			game.modules.get("variant-encumbrance-dnd5e")?.active &&
			game.settings.get(CONSTANTS.MODULE_NAME, "enableIntegrationWithVariantEncumbrance")
		) {
			const encumbranceData = <
				EncumbranceData //@ts-ignore
			>game.modules.get("variant-encumbrance-dnd5e")?.api.calculateWeightOnActorWithItemsNoInventoryPlus(this.actor, items);
			return encumbranceData.totalWeight;
		} else {
			const doNotIncreaseWeightByQuantityForNoAmmunition = <boolean>(
				game.settings.get(CONSTANTS.MODULE_NAME, "doNotIncreaseWeightByQuantityForNoAmmunition")
			);
			const doNotApplyWeightForEquippedArmor = <boolean>(
				game.settings.get(CONSTANTS.MODULE_NAME, "doNotApplyWeightForEquippedArmor")
			);
			for (const itemEntity of items) {
				//for (const i of this.actor.items) {
				if (type === this.getItemType(itemEntity)) {
					//@ts-ignore
					let q = <number>itemEntity.system.quantity || 0;
					//@ts-ignore
					const w = <number>itemEntity.system.weight || 0;
					let eqpMultiplyer = 1;
					if (game.settings.get(CONSTANTS.MODULE_NAME, "enableEquipmentMultiplier")) {
						eqpMultiplyer = <number>game.settings.get(CONSTANTS.MODULE_NAME, "equipmentMultiplier") || 1;
					}
					if (doNotIncreaseWeightByQuantityForNoAmmunition) {
						//@ts-ignore
						if (itemEntity.system.consumableType !== "ammo") {
							q = 1;
						}
					}
					const isEquipped: boolean =
						//@ts-ignore
						itemEntity.system.equipped ? true : false;
					if (isEquipped) {
						const itemArmorTypes = ["clothing", "light", "medium", "heavy", "natural"];
						if (
							doNotApplyWeightForEquippedArmor &&
							//@ts-ignore
							itemArmorTypes.includes(itemEntity.system.armor?.type)
						) {
							totalCategoryWeight += 0;
							continue;
						}
					}
					//@ts-ignore
					const e = <number>isEquipped ? eqpMultiplyer : 1;
					if (is_real_number(w) && is_real_number(q)) {
						//@ts-ignore
						totalCategoryWeight += w * q * e;
					} else {
						debug(
							`The item '${itemEntity.name}', on category '${type}', on actor ${this.actor?.name} has not valid weight or quantity `
						);
					}
				}
			}
		}
		return totalCategoryWeight.toNearest(0.1);
	}

	getCategoryItemBulk(sectionId: string): number {
		// let totalCategoryWeight = 0;
		const items = API.getItemsFromCategory(this.actor, sectionId, this.customCategorys);
		if (
			game.modules.get("variant-encumbrance-dnd5e")?.active &&
			game.settings.get(CONSTANTS.MODULE_NAME, "enableIntegrationWithVariantEncumbrance")
		) {
			// const encumbranceData = <
			// 	EncumbranceBulkData //@ts-ignore
			// >game.modules.get("variant-encumbrance-dnd5e")?.api.calculateBulkOnActorWithItems(this.actor, items);
			const encumbranceData = <
				EncumbranceBulkData //@ts-ignore
			>game.modules.get("variant-encumbrance-dnd5e")?.api.calculateBulkOnActorWithItemsNoInventoryPlus(this.actor, items);

			const currentCategory = <Category>this.customCategorys[sectionId];
			const totalWeight = encumbranceData.totalWeight + (currentCategory.ownBulk ?? 0);
			return totalWeight;
		} else {
			return 0;
		}
	}

	// static getCSSName(element) {
	//   const version = <string[]>game.system.version.split('.');
	//   if (element === 'sub-header') {
	//     if (Number(version[0]) == 0 && Number(version[1]) <= 9 && Number(version[2]) <= 8) {
	//       return 'inventory-header';
	//     } else {
	//       return 'items-header';
	//     }
	//   }
	// }

	async saveCategorys() {
		await this.actor.setFlag(CONSTANTS.MODULE_NAME, InventoryPlusFlags.CATEGORYS, this.customCategorys);
	}

	/**
	 * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset.
	 * @param {Event} event          The originating click event.
	 * @returns {Promise<Item5e[]>}  The newly created item.
	 * @private
	 */
	async _onItemCreate(event, type: string) {
		event.preventDefault();
		const header = event.currentTarget;

		// Check to make sure the newly created class doesn't take player over level cap
		//@ts-ignore
		if (type === "class" && this.actor.system.details.level + 1 > CONFIG.DND5E.maxLevel) {
			return ui.notifications.error(
				game.i18n.format(
					"DND5E.MaxCharacterLevelExceededWarn",
					//@ts-ignore
					{ max: CONFIG.DND5E.maxLevel }
				)
			);
		}

		let myName = "";
		const dnd5eItems = [
			"weapon",
			"equipment",
			"consumable",
			"tool",
			"loot",
			"background",
			//"class",
			//"subclass",
			//"spell",
			"feat",
		];
		let itemTypeTmp = "";
		if (dnd5eItems.includes(type.toLowerCase())) {
			myName = game.i18n.format("DND5E.ItemNew", {
				type: game.i18n.localize(`ITEM.ItemType${type.capitalize()}`),
			});
			itemTypeTmp = type;
		} else {
			const defaultType = <InventoryPlusItemType>this.customCategorys[type]?.explicitTypes.filter((i) => {
				return i.isSelected && i.isInventory;
			})[0];
			if (!defaultType.id) {
				itemTypeTmp = "weapon";
			} else {
				itemTypeTmp = defaultType.id;
			}
			myName = game.i18n.format("DND5E.ItemNew", {
				type: game.i18n.localize(`ITEM.ItemType${itemTypeTmp.capitalize()}`),
			});
		}
		/*
		const itemData = {
			name: myName,
			type: itemTypeTmp,
			data: foundry.utils.deepClone(header.dataset),
		};
		//@ts-ignore
		delete itemData.type;
		*/
		const itemData = {
			name: myName,
			type: itemTypeTmp,
			// dataset: foundry.utils.deepClone(header.dataset),
		};
		const items = <Item[]>await this.actor.createEmbeddedDocuments("Item", [itemData]);
		const dropedItem = <Item>items[0];

		await dropedItem.setFlag(CONSTANTS.MODULE_NAME, InventoryPlusFlags.CATEGORY, type);
	}
}
