import { getLastSeen, resetLastSeen } from "./lastSeen";

beforeEach(resetLastSeen);

describe("getLastSeen", () => {
  it("starts empty for a home it has not seen", () => {
    expect(getLastSeen("m1", "/srv/crew")).toEqual({ sections: null, updatedAt: null, records: new Map() });
  });

  it("gives the same entry for the same machine and folder, so what one visit saves the next one finds", () => {
    getLastSeen("m1", "/srv/crew").updatedAt = 1_000;

    expect(getLastSeen("m1", "/srv/crew").updatedAt).toBe(1_000);
  });

  it.each([
    ["another folder", "m1", "/srv/other"],
    ["another machine", "m2", "/srv/crew"],
  ])("keeps %s apart", (_name, machineId, folder) => {
    getLastSeen("m1", "/srv/crew").updatedAt = 1_000;

    expect(getLastSeen(machineId, folder).updatedAt).toBeNull();
  });

  it("forgets everything on reset", () => {
    getLastSeen("m1", "/srv/crew").updatedAt = 1_000;
    resetLastSeen();

    expect(getLastSeen("m1", "/srv/crew").updatedAt).toBeNull();
  });
});
