const MODULE_ID = "alienrpg-squad-list";
const SETTING_SQUAD = "squad";
const SETTING_LAYOUT = "layout";
const MEMBER_TYPES = ["character", "synthetic"];

/** Default window size for each layout, applied on open and when switching. */
const LAYOUT_SIZE = {
  vertical: { width: 640, height: 720 },
  horizontal: { width: 1280, height: 420 },
};

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A single-window roster. The vertical layout has one column per marine and one row per
 * stat; the horizontal layout transposes it to one row per marine.
 */
class SquadList extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "alienrpg-squad-list",
    classes: ["squad-list"],
    window: {
      title: "SQUADLIST.Title",
      icon: "fa-solid fa-people-group",
      resizable: true,
    },
    position: { width: 640, height: 720 },
    actions: {
      openSheet: SquadList.#onOpenSheet,
      removeMember: SquadList.#onRemoveMember,
      clearSquad: SquadList.#onClearSquad,
      toggleLayout: SquadList.#onToggleLayout,
    },
  };

  static PARTS = {
    roster: { template: `modules/${MODULE_ID}/templates/squad-list.hbs`, scrollable: [".squad-table-wrap"] },
  };

  /** Actors currently on the list that this user may see. */
  get members() {
    return getSquadIds()
      .map((id) => game.actors.get(id))
      .filter((a) => a?.testUserPermission(game.user, "OBSERVER"));
  }

  async _prepareContext(options) {
    const members = this.members;
    const evolved = game.settings.get("alienrpg", "evolved");
    const cfg = CONFIG.ALIENRPG;

    const marines = members.map((actor) => {
      const sys = actor.system;
      const careerKey = sys.general?.career?.value;
      const career = cfg.career_list?.[careerKey]?.label;
      const talents = actor.items
        .filter((i) => i.type === "talent")
        .map((i) => i.name)
        .sort((a, b) => a.localeCompare(b, game.i18n.lang));
      return {
        id: actor.id,
        name: actor.name,
        img: actor.img,
        career: career ? game.i18n.localize(career) : "",
        broken: sys.header.health.value <= 0,
        isSynthetic: actor.type === "synthetic",
        talentCount: talents.length,
        talentTooltip: talents.length ? talentTooltip(talents) : "",
      };
    });

    const cell = (value, extra = {}) => ({ value, ...extra });

    const vitals = [
      {
        label: game.i18n.localize("ALIENRPG.Health"),
        cells: members.map((a) => {
          const { value, calculatedMax: max } = a.system.header.health;
          return cell(`${value} / ${max}`, {
            meter: max > 0 ? Math.clamp(value / max, 0, 1) * 100 : 0,
            cls: value <= 0 ? "danger" : value < max ? "warn" : "",
          });
        }),
      },
      {
        label: game.i18n.localize("ALIENRPG.Stress"),
        cells: members.map((a) => {
          if (a.type === "synthetic") return cell("—", { cls: "muted" });
          const value = a.system.header.stress.value;
          return cell(value, {
            pips: Array.from({ length: 10 }, (_, i) => i < value),
            cls: value >= 7 ? "danger" : value >= 4 ? "warn" : "",
          });
        }),
      },
    ];
    if (evolved) {
      vitals.push({
        label: game.i18n.localize("ALIENRPG.Resolve"),
        cells: members.map((a) => {
          const r = a.system.header.resolve;
          return r ? cell(`${r.value} / ${r.calculatedMax}`) : cell("—", { cls: "muted" });
        }),
      });
    }

    // Attributes show the effective value (base + talents/items/effects); the base
    // value is kept for the tooltip so modified scores stand out.
    const attributes = Object.entries(cfg.attributes).map(([key, label]) => ({
      label: game.i18n.localize(label),
      cells: members.map((a) => {
        const attr = a.system.attributes?.[key];
        if (!attr) return cell("—", { cls: "muted" });
        const modified = attr.mod !== attr.value;
        return cell(attr.mod, {
          cls: modified ? "modified" : "",
          tooltip: modified ? `${attr.value} → ${attr.mod}` : "",
        });
      }),
    }));

    // Skills are grouped under their governing attribute. Each cell shows skill
    // ranks, with the full dice pool (ranks + attribute + modifiers) alongside.
    const skillGroups = Object.entries(cfg.attributes).map(([attrKey, attrLabel]) => ({
      key: attrKey,
      label: game.i18n.localize(attrLabel),
      rows: Object.entries(cfg.skills)
        .filter(([, def]) => def.attrib === attrKey)
        .map(([key, def]) => ({
          label: game.i18n.localize(def.name),
          cells: members.map((a) => {
            const skill = a.system.skills?.[key];
            if (!skill) return cell("—", { cls: "muted" });
            return cell(skill.value, {
              pool: skill.mod,
              cls: skill.value ? "" : "zero",
              tooltip: `${game.i18n.localize(def.name)}: ${skill.value} + ${skill.attrmod} = ${skill.mod}`,
            });
          }),
        })),
    }));

    const horizontal = getLayout() === "horizontal";

    // The horizontal layout needs the same stats as columns: flatten the row groups
    // into a column list, then give each marine its cells in column order.
    let columns = [];
    let marineRows = [];
    if (horizontal) {
      const col = (row, section, groupStart = false) => ({ ...row, section, groupStart });
      columns = [
        ...vitals.map((r, i) => col(r, "vitals", i === 0)),
        ...attributes.map((r, i) => col(r, "attributes", i === 0)),
        ...skillGroups.flatMap((g) =>
          g.rows.map((r, i) => col({ ...r, tooltip: `${g.label}: ${r.label}` }, "skills", i === 0)),
        ),
      ];
      marineRows = marines.map((m, i) => ({
        ...m,
        cells: columns.map((c) => ({ ...c.cells[i], groupStart: c.groupStart })),
      }));
    }

    return {
      isGM: game.user.isGM,
      horizontal,
      layoutTooltip: horizontal ? "SQUADLIST.SwitchVertical" : "SQUADLIST.SwitchHorizontal",
      columns,
      marineRows,
      sectionSpans: {
        vitals: vitals.length,
        attributes: attributes.length,
        skills: skillGroups.reduce((n, g) => n + g.rows.length, 0),
      },
      hasMembers: members.length > 0,
      marines,
      vitals,
      attributes,
      skillGroups,
      colspan: members.length + 1,
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    if (!game.user.isGM) return;
    this.element.addEventListener("dragover", (event) => event.preventDefault());
    this.element.addEventListener("drop", this.#onDrop.bind(this));
  }

  async #onDrop(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    let actors = [];
    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (actor) actors.push(actor);
    } else if (data.type === "Folder") {
      const folder = await fromUuid(data.uuid);
      if (folder?.type === "Actor") actors = folder.contents;
    }
    if (!actors.length) return;

    const valid = actors.filter((a) => MEMBER_TYPES.includes(a.type) && !a.pack);
    if (valid.length < actors.length) ui.notifications.warn("SQUADLIST.WrongType", { localize: true });
    if (!valid.length) return;

    const ids = getSquadIds();
    for (const actor of valid) if (!ids.includes(actor.id)) ids.push(actor.id);
    await setSquadIds(ids);
  }

  static #onOpenSheet(event, target) {
    game.actors.get(target.closest("[data-actor-id]").dataset.actorId)?.sheet.render(true);
  }

  static async #onRemoveMember(event, target) {
    const id = target.closest("[data-actor-id]").dataset.actorId;
    await setSquadIds(getSquadIds().filter((i) => i !== id));
  }

  static #onToggleLayout() {
    return game.settings.set(MODULE_ID, SETTING_LAYOUT, getLayout() === "horizontal" ? "vertical" : "horizontal");
  }

  static async #onClearSquad() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "SQUADLIST.Clear" },
      content: `<p>${game.i18n.localize("SQUADLIST.ClearConfirm")}</p>`,
    });
    if (ok) await setSquadIds([]);
  }
}

/** An HTML list of talent names for the header tooltip. */
function talentTooltip(names) {
  const { escapeHTML } = foundry.utils;
  const items = names.map((n) => `<li>${escapeHTML(n)}</li>`).join("");
  return `<strong>${game.i18n.localize("SQUADLIST.Talents")}</strong><ul>${items}</ul>`;
}

function getLayout() {
  return game.settings.get(MODULE_ID, SETTING_LAYOUT);
}

function getSquadIds() {
  return [...game.settings.get(MODULE_ID, SETTING_SQUAD)];
}

function setSquadIds(ids) {
  return game.settings.set(MODULE_ID, SETTING_SQUAD, ids);
}

let app;
function openSquadList() {
  app ??= new SquadList({ position: { ...LAYOUT_SIZE[getLayout()] } });
  return app.render({ force: true });
}

/** Re-render the open window, coalescing bursts of document updates. */
const refresh = foundry.utils.debounce(() => {
  if (app?.rendered) app.render();
}, 100);

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_SQUAD, {
    name: "SQUADLIST.SettingSquad",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: refresh,
  });

  // Layout is a personal preference, so it's stored per client.
  game.settings.register(MODULE_ID, SETTING_LAYOUT, {
    name: "SQUADLIST.SettingLayout",
    hint: "SQUADLIST.SettingLayoutHint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      vertical: "SQUADLIST.LayoutVertical",
      horizontal: "SQUADLIST.LayoutHorizontal",
    },
    default: "vertical",
    onChange: (layout) => {
      if (!app?.rendered) return;
      app.setPosition(LAYOUT_SIZE[layout]);
      app.render();
    },
  });

  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/squad-list.hbs`,
    `modules/${MODULE_ID}/templates/cell.hbs`,
  ]);

  game.modules.get(MODULE_ID).api = { open: openSquadList, SquadList };
});

const isMember = (actor) => actor && getSquadIds().includes(actor.id);
Hooks.on("updateActor", (actor) => isMember(actor) && refresh());
Hooks.on("deleteActor", (actor) => {
  if (!isMember(actor)) return;
  if (game.user.isGM) setSquadIds(getSquadIds().filter((i) => i !== actor.id));
  else refresh();
});
// Items, talents and effects feed into the derived attribute and skill totals.
for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(hook, (doc) => isMember(doc.parent) && refresh());
}

Hooks.on("renderActorDirectory", (directory, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (root.querySelector(".squad-list-open")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "squad-list-open";
  button.innerHTML = `<i class="fa-solid fa-people-group"></i> ${game.i18n.localize("SQUADLIST.Open")}`;
  button.addEventListener("click", openSquadList);
  root.querySelector(".header-actions")?.append(button);
});
