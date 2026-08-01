import { describe, expect, it } from "vitest";
import { buildCommercePrompts, derivePackStatus, validateCommerceInput } from "@/lib/commerce-pack";

const valid = {
  product_name: "Powerbeats Pro 2",
  category: "Wireless earbuds",
  target_buyer: "Athletes",
  source_url: "https://example.com/product",
  source_images: ["https://cdn.example.com/product.jpg"],
  verified_features: ["Secure-fit ear hooks", "Active noise cancelling"],
  preset: "minimal_studio",
};

describe("commerce pack contract", () => {
  it("accepts a complete pack input", () => {
    expect(validateCommerceInput(valid).value).toMatchObject({ productName: "Powerbeats Pro 2", preset: "minimal_studio" });
  });

  it("requires real references and verified features", () => {
    expect(validateCommerceInput({ ...valid, source_images: [] }).error).toContain("between 1 and 14");
    expect(validateCommerceInput({ ...valid, verified_features: [] }).error).toContain("at least one");
  });

  it("builds four product-faithful prompts with role-specific constraints", () => {
    const input = validateCommerceInput(valid).value!;
    const prompts = buildCommercePrompts(input);
    expect(Object.keys(prompts)).toEqual(["hero", "lifestyle", "feature", "detail"]);
    Object.values(prompts).forEach((prompt) => expect(prompt).toContain("exact source of truth"));
    expect(prompts.hero).toContain("pure white #FFFFFF");
    expect(prompts.feature).toContain("No generated words");
    expect(prompts.detail).toContain("Do not reveal or invent unseen geometry");
  });

  it("derives partial success without discarding ready outputs", () => {
    expect(derivePackStatus(["ready", "ready", "failed", "failed"])).toBe("partial");
    expect(derivePackStatus(["ready", "ready", "processing", "failed"])).toBe("processing");
    expect(derivePackStatus(["ready", "ready", "ready", "ready"])).toBe("ready");
  });
});
