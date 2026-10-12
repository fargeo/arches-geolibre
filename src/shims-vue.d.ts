/// <reference types="vite/client" />

declare module "*.vue" {
    import type { DefineComponent } from "vue";
    const component: DefineComponent<object, object, unknown>;
    export default component;
}

interface ImportMetaEnv {
    /** "true" shows the Phase 0 diagnostics in the panel. */
    readonly VITE_ARCHES_GEOLIBRE_DIAGNOSTICS?: string;
}
