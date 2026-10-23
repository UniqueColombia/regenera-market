import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { agrupar } = await import("./ritmo");

describe("agrupar (IPv6 por /64)", () => {
  it("deja las IPv4 como están", () => {
    expect(agrupar("190.24.5.10")).toBe("190.24.5.10");
  });

  it("cuenta dos direcciones del mismo /64 como una sola", () => {
    expect(agrupar("2800:e2:1a00:5a1:abcd:1:2:3")).toBe("2800:e2:1a00:5a1::/64");
    expect(agrupar("2800:e2:1a00:5a1::9")).toBe("2800:e2:1a00:5a1::/64");
    expect(agrupar("2800:00e2:1a00:05a1:ffff::1")).toBe("2800:e2:1a00:5a1::/64");
  });

  it("expande las direcciones comprimidas antes de cortar", () => {
    expect(agrupar("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(agrupar("::1")).toBe("0:0:0:0::/64");
  });
});
