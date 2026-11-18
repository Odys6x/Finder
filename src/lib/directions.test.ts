import { describe, expect, it } from "vitest";
import { directionsEmbedUrl, directionsLink } from "./directions";

const home = { lat: 1.3408, lng: 103.9494 };
const dest = { name: "Bedok Green Secondary School", postalCode: "469722", lat: 1.33, lng: 103.93 };

describe("directions", () => {
  it("builds a Google Maps directions link with transit by default", () => {
    const u = new URL(directionsLink(home, dest));
    expect(u.origin + u.pathname).toBe("https://www.google.com/maps/dir/");
    expect(u.searchParams.get("api")).toBe("1");
    expect(u.searchParams.get("origin")).toBe("1.3408,103.9494");
    expect(u.searchParams.get("destination")).toBe("Bedok Green Secondary School, Singapore 469722");
    expect(u.searchParams.get("travelmode")).toBe("transit");
  });

  it("builds an Embed API URL with the chosen mode", () => {
    const u = new URL(directionsEmbedUrl("KEY", home, dest, "walking"));
    expect(u.pathname).toBe("/maps/embed/v1/directions");
    expect(u.searchParams.get("key")).toBe("KEY");
    expect(u.searchParams.get("mode")).toBe("walking");
    expect(u.searchParams.get("region")).toBe("sg");
  });
});
