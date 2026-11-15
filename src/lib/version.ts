import pkg from "../../package.json";

/** Single version source: package.json (checked by CI against tags). */
export const appVersion: string = pkg.version;
