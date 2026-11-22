import { browserStorage } from "./storage/device";
import { startApp } from "./ui/app";
import { startPWA } from "./ui/pwa";
import { AppState } from "./ui/state";

const state = new AppState(browserStorage());
startApp(state);
startPWA();
