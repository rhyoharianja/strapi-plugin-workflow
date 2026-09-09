import { getTranslation } from "./utils/getTranslation";
import { PLUGIN_ID } from "./pluginId";
import { Initializer } from "./components/Initializer";
import { PluginIcon } from "./components/PluginIcon";
import { StagePanel } from "./components/StagePanel";
import { gateDocumentActions } from "./documentActions";

import type { StrapiApp } from "@strapi/strapi/admin";

const plugin: StrapiApp["appPlugins"][string] = {
  register(app) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: "Workflow",
      },
      Component: () => import("./pages/App"),
      permissions: [],
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  bootstrap(app) {
    /**
     * Inject the stage panel into the Content Manager edit view.
     *
     * The panel renders nothing for content-types that no enabled workflow governs, so it
     * is safe to register globally rather than per content-type — which content-types are
     * governed is data and can change at any time.
     */
    const contentManager = app.getPlugin("content-manager");

    contentManager.injectComponent("editView", "right-links", {
      name: `${PLUGIN_ID}-stage-panel`,
      Component: StagePanel,
    });

    /**
     * Disable Publish and Unpublish where they would contradict the stage.
     *
     * `addDocumentAction` takes a function over the *existing* actions, which is the only way
     * to change a built-in one — an array would merely append. The rule itself is enforced
     * server-side; this stops the editor discovering it by pressing an enabled button.
     */
    (
      contentManager.apis as {
        addDocumentAction: (mapper: (actions: never[]) => never[]) => void;
      }
    ).addDocumentAction(gateDocumentActions as unknown as (actions: never[]) => never[]);
  },

  registerTrads({ locales }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = (await import(
            `./translations/${locale}.json`
          )) as {
            default: Record<string, string>;
          };

          const newData: Record<string, string> = {};
          const keys = Object.keys(data);

          for (const key of keys) {
            newData[getTranslation(key)] = data[key];
          }

          return { data: newData, locale };
        } catch {
          return { data: {}, locale };
        }
      }),
    );
  },
};

export default plugin;
