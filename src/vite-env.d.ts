/// <reference types="vite/client" />

import { Environment } from "@usecapsule/web-sdk";

interface ImportMetaEnv {
  readonly VITE_CAPSULE_ENV: Environment;
  readonly VITE_CAPSULE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
