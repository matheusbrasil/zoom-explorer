import { htmlToElement } from "./htmltools.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { ZoomDevice } from "./ZoomDevice.js";

type EffectEntry = {
  id: number;
  name: string;
  color: string;
};

type CategoryEntry = {
  key: string;
  name: string;
  color: string;
  effects: EffectEntry[];
};

export class ZoomEffectSelector
{
  private effectSelector: HTMLDialogElement = document.createElement("dialog");
  private headingElement: HTMLHeadingElement = document.createElement("h2");
  private listElement: HTMLDivElement = document.createElement("div");
  private backButton: HTMLButtonElement = document.createElement("button");
  private confirmButton: HTMLButtonElement = document.createElement("button");

  private effectLists: Map<string, Map<number, string>> = new Map<string, Map<number, string>>();
  private heading = "Effects";
  private selectedPedalName = "";
  private currentEffectID = -1;

  private categoryEntries: CategoryEntry[] = [];
  private activeCategoryKey: string | undefined = undefined;
  private selectedEffect: EffectEntry | undefined = undefined;
  private selectedEffectElement: HTMLButtonElement | undefined = undefined;
  private pendingResolve: ((result: [effectID: number, effectName: string, pedalName: string]) => void) | undefined = undefined;

  constructor()
  {
    this.createHTML();
  }

  private createHTML()
  {
    let isMobile = window.matchMedia("(pointer: coarse)").matches;
    let html = `
      <dialog class="changeEffectDialog" aria-label="Select effect">
        <div class="changeEffectPanel" role="document">
          <header class="changeEffectHeader">
            <button type="button" class="changeEffectBackButton">
              <span class="material-symbols-outlined">arrow_back_ios_new</span>
              <span>Back</span>
            </button>
            <h2 class="changeEffectTitle">Effects</h2>
            <button type="button" class="changeEffectConfirmButton">OK</button>
          </header>
          ${isMobile ? `
          <div class="changeEffectMobileCategoryBar" role="tablist" aria-label="Category filter"></div>
          <div class="changeEffectList changeEffectGridLayout" role="listbox" aria-label="Effects"></div>
          ` : `
          <div class="changeEffectList" role="listbox" aria-label="Effect categories and effects"></div>
          `}
        </div>
      </dialog>
    `;

    this.effectSelector = htmlToElement(html) as HTMLDialogElement;
    let headingElement = this.effectSelector.querySelector(".changeEffectTitle");
    let listElement = this.effectSelector.querySelector(".changeEffectList");
    let backButton = this.effectSelector.querySelector(".changeEffectBackButton");
    let confirmButton = this.effectSelector.querySelector(".changeEffectConfirmButton");

    if (!(headingElement instanceof HTMLHeadingElement) ||
      !(listElement instanceof HTMLDivElement) ||
      !(backButton instanceof HTMLButtonElement) ||
      !(confirmButton instanceof HTMLButtonElement)) {
      throw new Error("ZoomEffectSelector failed to initialize required DOM references.");
    }

    this.headingElement = headingElement;
    this.listElement = listElement;
    this.backButton = backButton;
    this.confirmButton = confirmButton;

    this.backButton.addEventListener("click", () => this.handleBack());
    this.confirmButton.addEventListener("click", () => this.confirmSelection());

    this.effectSelector.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.cancelSelection();
    });

    this.effectSelector.addEventListener("close", () => {
      if (this.pendingResolve !== undefined)
        this.resolveSelection([-1, "", ""]);
    });

    this.effectSelector.addEventListener("click", (event) => {
      if (event.target === this.effectSelector)
        this.cancelSelection();
    });
  }

  public get htmlElement(): HTMLElement
  {
    return this.effectSelector;
  }

  public setHeading(heading: string)
  {
    let normalized = heading.trim();
    if (normalized.length > 0)
      this.heading = normalized;
  }

  public clearEffectList(_clearPedalList: boolean = false)
  {
    this.categoryEntries = [];
    this.listElement.replaceChildren();
  }

  public setEffectList(effectLists: Map<string, Map<number, string>>, defaultPedalName: string = "")
  {
    this.effectLists = effectLists;
    this.selectedPedalName = this.resolvePedalName(defaultPedalName);
  }

  public setSelectedPedal(pedalName: string)
  {
    this.selectedPedalName = this.resolvePedalName(pedalName);
    if (this.selectedPedalName.length === 0)
      shouldLog(LogLevel.Error) && console.error(`No effect list found for pedal ${pedalName}`);
  }

  private normalizePedalName(name: string): string
  {
    return name
      .trim()
      .toUpperCase()
      .replace(/PLUS/g, "+")
      .replace(/[^A-Z0-9+]/g, "");
  }

  private resolvePedalNameFromAliases(requestedPedalName: string): string
  {
    let normalizedRequested = this.normalizePedalName(requestedPedalName);
    if (normalizedRequested.length === 0)
      return "";

    let bestMatch = "";
    let bestMatchLength = -1;
    for (let pedalName of this.effectLists.keys()) {
      let normalizedAvailable = this.normalizePedalName(pedalName);
      if (normalizedAvailable.length === 0)
        continue;
      if (normalizedAvailable === normalizedRequested)
        return pedalName;
      if (normalizedRequested.includes(normalizedAvailable) || normalizedAvailable.includes(normalizedRequested)) {
        if (normalizedAvailable.length > bestMatchLength) {
          bestMatch = pedalName;
          bestMatchLength = normalizedAvailable.length;
        }
      }
    }
    return bestMatch;
  }

  private resolvePedalName(requestedPedalName: string): string
  {
    if (requestedPedalName.length > 0 && this.effectLists.has(requestedPedalName))
      return requestedPedalName;
    if (requestedPedalName.length > 0) {
      let resolvedAlias = this.resolvePedalNameFromAliases(requestedPedalName);
      if (resolvedAlias.length > 0)
        return resolvedAlias;
    }
    if (this.selectedPedalName.length > 0 && this.effectLists.has(this.selectedPedalName))
      return this.selectedPedalName;
    return "";
  }

  private buildCategoryEntries(pedalName: string): CategoryEntry[]
  {
    let effectList = this.effectLists.get(pedalName);
    if (effectList === undefined)
      return [];

    let sortedEffects = Array.from(effectList.entries()).sort((a, b) => a[0] - b[0]);
    let categories: CategoryEntry[] = [];
    let categoryByKey = new Map<string, CategoryEntry>();

    for (let [id, name] of sortedEffects) {
      let category = (id & 0xFF000000) >>> 24;
      let categoryName = ZoomDevice.getCategoryNameFromID(id, pedalName);
      if (categoryName === undefined || categoryName.trim().length === 0)
        categoryName = `Category ${category.toString(16).toUpperCase().padStart(2, "0")}`;
      let key = `${category.toString(16).padStart(2, "0")}:${categoryName}`;
      let effectColor = ZoomDevice.getColorFromEffectID(id, pedalName);
      let categoryEntry = categoryByKey.get(key);
      if (categoryEntry === undefined) {
        categoryEntry = {
          key: key,
          name: categoryName,
          color: effectColor,
          effects: []
        };
        categoryByKey.set(key, categoryEntry);
        categories.push(categoryEntry);
      }

      categoryEntry.effects.push({
        id: id,
        name: name,
        color: effectColor
      });
    }

    return categories;
  }

  private resolveSelection(result: [effectID: number, effectName: string, pedalName: string]): void
  {
    let resolve = this.pendingResolve;
    this.pendingResolve = undefined;
    if (resolve !== undefined)
      resolve(result);
  }

  private closeDialog(): void
  {
    if (this.effectSelector.open)
      this.effectSelector.close();
  }

  private cancelSelection(): void
  {
    this.resolveSelection([-1, "", ""]);
    this.closeDialog();
  }

  private handleBack(): void
  {
    let isMobile = window.matchMedia("(pointer: coarse) and (max-width: 980px)").matches;
    // On mobile, categories and effects are shown simultaneously — no separate
    // category screen exists, so Back always closes the dialog.
    if (isMobile) {
      this.cancelSelection();
      return;
    }
    if (this.activeCategoryKey !== undefined) {
      this.renderCategoryList();
      return;
    }
    this.cancelSelection();
  }

  private confirmSelection(): void
  {
    if (this.selectedEffect === undefined || this.selectedPedalName.length === 0)
      return;
    this.resolveSelection([this.selectedEffect.id, this.selectedEffect.name, this.selectedPedalName]);
    this.closeDialog();
  }

  private renderCategoryList(): void
  {
    this.activeCategoryKey = undefined;
    this.selectedEffect = undefined;
    this.selectedEffectElement = undefined;

    this.headingElement.textContent = this.heading;
    this.confirmButton.classList.remove("visible");
    this.confirmButton.disabled = true;
    
    let isMobile = window.matchMedia("(pointer: coarse) and (max-width: 980px)").matches;
    
    if (isMobile && this.categoryEntries.length > 0) {
      // Mobile: Show category pills + all effects in grid
      this.renderMobileLayout();
    } else {
      // Desktop: Show categories as list
      this.listElement.replaceChildren();
      
      if (this.categoryEntries.length === 0) {
        let emptyState = document.createElement("div");
        emptyState.className = "changeEffectEmptyState";
        emptyState.textContent = "No categories available for this pedal.";
        this.listElement.appendChild(emptyState);
        return;
      }

      for (let category of this.categoryEntries) {
        let item = document.createElement("button");
        item.type = "button";
        item.className = "changeEffectListItem changeEffectCategoryItem";
        item.style.setProperty("--category-color", category.color);
        item.setAttribute("role", "option");
        item.setAttribute("aria-label", category.name);

        let name = document.createElement("span");
        name.className = "changeEffectItemName";
        name.textContent = category.name.toUpperCase();

        let icon = document.createElement("span");
        icon.className = "material-symbols-outlined changeEffectItemChevron";
        icon.textContent = "chevron_right";

        item.appendChild(name);
        item.appendChild(icon);
        item.addEventListener("click", () => this.renderEffectList(category.key));
        this.listElement.appendChild(item);
      }
    }
  }

  private renderMobileLayout(): void
  {
    // Render category pills at top
    let categoryBar = this.effectSelector.querySelector(".changeEffectMobileCategoryBar");
    if (categoryBar && categoryBar instanceof HTMLElement) {
      categoryBar.replaceChildren();
      
      for (let category of this.categoryEntries) {
        let pill = document.createElement("button");
        pill.type = "button";
        pill.className = "changeEffectCategoryPill";
        pill.style.setProperty("--category-color", category.color);
        pill.setAttribute("data-category-key", category.key);
        pill.textContent = category.name.toUpperCase();
        pill.addEventListener("click", () => this.filterEffectsByCategory(category.key, pill));
        categoryBar.appendChild(pill);
      }
      
      // Select first category by default
      let firstPill = categoryBar.querySelector("button") as HTMLButtonElement;
      if (firstPill) {
        firstPill.classList.add("active");
        this.activeCategoryKey = firstPill.getAttribute("data-category-key") || undefined;
      }
    }
    
    // Render all effects in grid
    this.listElement.replaceChildren();
    this.listElement.classList.add("changeEffectGridLayout");
    this.renderAllEffectsFiltered();
  }

  private filterEffectsByCategory(categoryKey: string, pillElement: HTMLButtonElement): void
  {
    // Remove active from all pills
    let categoryBar = this.effectSelector.querySelector(".changeEffectMobileCategoryBar");
    if (categoryBar instanceof HTMLElement) {
      categoryBar.querySelectorAll(".changeEffectCategoryPill").forEach(pill => {
        pill.classList.remove("active");
      });
    }
    
    // Set active on clicked pill
    pillElement.classList.add("active");
    this.activeCategoryKey = categoryKey;
    
    // Re-render effects
    this.renderAllEffectsFiltered();
  }

  private renderAllEffectsFiltered(): void
  {
    this.listElement.replaceChildren();
    let category = this.categoryEntries.find(c => c.key === this.activeCategoryKey);
    
    if (!category) return;
    
    for (let effect of category.effects) {
      let item = document.createElement("button");
      item.type = "button";
      item.className = "changeEffectGridItem changeEffectMobileEffectItem";
      item.style.setProperty("--effect-color", effect.color);
      item.setAttribute("role", "option");
      item.setAttribute("aria-label", effect.name);

      let name = document.createElement("span");
      name.className = "changeEffectMobileEffectName";
      name.textContent = effect.name;

      item.appendChild(name);
      item.addEventListener("click", () => this.selectEffect(effect, item));
      this.listElement.appendChild(item);

      if (effect.id === this.currentEffectID) {
        this.selectedEffect = effect;
        this.selectedEffectElement = item;
        item.classList.add("selected");
      }
    }
  }

  private selectEffect(effect: EffectEntry, effectElement: HTMLButtonElement): void
  {
    if (this.selectedEffectElement !== undefined)
      this.selectedEffectElement.classList.remove("selected");
    this.selectedEffect = effect;
    this.selectedEffectElement = effectElement;
    effectElement.classList.add("selected");
    this.confirmButton.disabled = false;
    this.confirmSelection();
  }

  private renderEffectList(categoryKey: string): void
  {
    let category = this.categoryEntries.find(entry => entry.key === categoryKey);
    if (category === undefined)
      return;

    this.activeCategoryKey = categoryKey;
    this.selectedEffect = undefined;
    this.selectedEffectElement = undefined;

    this.headingElement.textContent = category.name.toUpperCase();
    this.confirmButton.classList.remove("visible");
    this.confirmButton.disabled = true;
    this.listElement.replaceChildren();

    for (let effect of category.effects) {
      let item = document.createElement("button");
      item.type = "button";
      item.className = "changeEffectListItem changeEffectEntryItem";
      item.style.setProperty("--effect-color", effect.color);
      item.setAttribute("role", "option");
      item.setAttribute("aria-label", effect.name);

      let name = document.createElement("span");
      name.className = "changeEffectItemName";
      name.textContent = effect.name.toUpperCase();

      item.appendChild(name);
      item.addEventListener("click", () => this.selectEffect(effect, item));
      this.listElement.appendChild(item);

      if (effect.id === this.currentEffectID) {
        this.selectedEffect = effect;
        this.selectedEffectElement = item;
        item.classList.add("selected");
      }
    }
  }

  public async getEffect(currentEffectID: number, currentPedalName: string): Promise<[effectID: number, effectName: string, pedalName: string]>
  {
    return new Promise<[effectID: number, effectName: string, pedalName: string]>((resolve) => {
      if (this.pendingResolve !== undefined)
        this.resolveSelection([-1, "", ""]);

      this.pendingResolve = resolve;
      this.currentEffectID = currentEffectID;
      this.selectedPedalName = this.resolvePedalName(currentPedalName);
      if (this.selectedPedalName.length === 0) {
        shouldLog(LogLevel.Warning) && console.warn(`Unable to resolve pedal "${currentPedalName}" to an effect list. Cancelling effect selection to avoid wrong model list.`);
        this.resolveSelection([-1, "", ""]);
        return;
      }
      this.categoryEntries = this.buildCategoryEntries(this.selectedPedalName);
      this.renderCategoryList();

      if (!this.effectSelector.open)
        this.effectSelector.showModal();
    });
  }
}
