import { describe, expect, it } from "vitest";
import { emptyProfile } from "../src/domain/house/profile";
import { KEYS, type KeyValue, loadData, memoryStorage } from "../src/storage/device";
import { AppState, draftInput, emptyDraft, parseReading } from "../src/ui/state";

const fixedNow = () => new Date("2026-11-22T08:00:00Z");
let n = 0;
const ids = () => `id-${++n}`;

describe("parseReading", () => {
  it("accepts comma decimals", () => {
    expect(parseReading("21,5", "73").reading).toEqual({ t: 21.5, rh: 73 });
  });

  it("reports each field's error, and nothing for empty fields", () => {
    expect(parseReading("", "")).toMatchObject({ reading: null, t: null, rh: null, empty: true });
    expect(parseReading("12abc", "120")).toMatchObject({ reading: null, t: "notANumber", rh: "humidityOutOfRange" });
    expect(parseReading("60", "0")).toMatchObject({ t: "temperatureOutOfRange", rh: "humidityOutOfRange" });
  });
});

describe("draftInput", () => {
  it("builds the check input once all four fields are valid", () => {
    const d = { ...emptyDraft(), indoorT: "21", indoorRh: "73", outdoorT: "10", outdoorRh: "80", recentRain: true };
    expect(draftInput(d).input).toEqual({
      indoor: { t: 21, rh: 73 },
      outdoor: { t: 10, rh: 80 },
      conditions: { storm: false, recentRain: true },
    });
    expect(draftInput({ ...d, outdoorRh: "" }).input).toBeNull();
  });
});

describe("AppState", () => {
  it("persists profile, draft and backup date, and reloads them", () => {
    const store = memoryStorage();
    const s = new AppState(store, fixedNow, ids);
    s.setProfile({ ...emptyProfile(), ventilation: "singleFlow" });
    s.setDraft({ indoorT: "21" });
    s.markBackup();
    const again = new AppState(store, fixedNow, ids);
    expect(again.profile.ventilation).toBe("singleFlow");
    expect(again.draft.indoorT).toBe("21");
    expect(again.lastBackup).toBe("2026-11-22T08:00:00.000Z");
  });

  it("notifies subscribers on data changes", () => {
    const s = new AppState(memoryStorage(), fixedNow, ids);
    let calls = 0;
    s.subscribe(() => calls++);
    s.setProfile(emptyProfile());
    s.removeEntry("none");
    expect(calls).toBe(2);
  });

  it("keeps working in memory and says so when the device refuses to store", () => {
    const refusing: KeyValue = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    const s = new AppState(refusing, fixedNow, ids);
    expect(s.stored).toBe(true);
    s.setProfile({ ...emptyProfile(), ventilation: "doubleFlow" });
    expect(s.stored).toBe(false);
    expect(s.profile.ventilation).toBe("doubleFlow");
    expect(new AppState(null).stored).toBe(false);
  });

  it("leaves unreadable stored entries out and counts them", () => {
    const store = memoryStorage({ [KEYS.log]: JSON.stringify([{ id: "x" }]), [KEYS.profile]: "not json" });
    expect(loadData(store)).toEqual({ profile: emptyProfile(), log: [], dropped: 1 });
    expect(new AppState(store).droppedOnLoad).toBe(1);
  });
});
