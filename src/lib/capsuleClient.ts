import { CapsuleWeb, Environment } from "@usecapsule/web-sdk";

const CAPSULE_ENV: Environment = import.meta.env.VITE_CAPSULE_ENV;
const CAPSULE_API_KEY = import.meta.env.VITE_CAPSULE_API_KEY;

const capsuleClient = new CapsuleWeb(CAPSULE_ENV, CAPSULE_API_KEY);

export default capsuleClient;
