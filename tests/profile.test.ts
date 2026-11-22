import { describe, expect, it } from "vitest";
import { angleBetween, emptyProfile, sanitizeProfile } from "../src/domain/house/profile";

describe("angleBetween", () => {
  it("measures the smallest angle between two orientations", () => {
    expect(angleBetween("N", "S")).toBe(180);
    expect(angleBetween("NE", "SW")).toBe(180);
    expect(angleBetween("NW", "NE")).toBe(90);
    expect(angleBetween("W", "W")).toBe(0);
    expect(angleBetween("N", "SE")).toBe(135);
  });
});

describe("sanitizeProfile", () => {
  it("keeps a valid profile unchanged", () => {
    const p = {
      version: 1,
      ventilation: "singleFlow",
      facades: [
        { id: "f1", name: "Façade ruisseau", orientation: "NE", facesWetArea: true, hasUpstairsOpenings: false },
      ],
      coldSurfaces: [{ id: "s1", name: "Plancher salon", location: "Au-dessus de la cave" }],
    };
    expect(sanitizeProfile(p)).toEqual({ profile: p, dropped: 0 });
  });

  it("drops invalid and duplicate entries and counts them", () => {
    const r = sanitizeProfile({
      version: 1,
      ventilation: "turbo",
      facades: [
        { id: "f1", name: "Sud", orientation: "S" },
        { id: "f1", name: "Doublon", orientation: "N" },
        { id: "f2", name: "Sans orientation" },
        "pas un objet",
      ],
      coldSurfaces: [
        { id: "s1", name: "  " },
        { id: "s2", name: "Cave" },
      ],
    });
    expect(r?.profile.ventilation).toBe("none");
    expect(r?.profile.facades).toEqual([
      { id: "f1", name: "Sud", orientation: "S", facesWetArea: false, hasUpstairsOpenings: false },
    ]);
    expect(r?.profile.coldSurfaces).toEqual([{ id: "s2", name: "Cave", location: "" }]);
    expect(r?.dropped).toBe(5);
  });

  it("rejects values that are not a profile of a known version", () => {
    expect(sanitizeProfile(null)).toBeNull();
    expect(sanitizeProfile([])).toBeNull();
    expect(sanitizeProfile({ version: 2 })).toBeNull();
  });

  it("does not count missing optional parts as dropped", () => {
    expect(sanitizeProfile({ version: 1 })).toEqual({ profile: emptyProfile(), dropped: 0 });
  });
});
