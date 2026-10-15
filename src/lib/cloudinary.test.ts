import { describe, expect, it } from "vitest";
import { churchFolder, deliveryUrl, sign } from "./cloudinary";
import { isOwnMedia } from "./display/theme";

describe("cloudinary", () => {
  it("signs requests the way Cloudinary's documentation shows", () => {
    // The worked example from Cloudinary's "Generating authentication signatures" guide.
    const params = { eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: 1315060510 };
    expect(sign(params, "abcd")).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("makes delivery links the projector accepts", () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "demo-church";
    const id = `${churchFolder("3f0c9a8e-1111-4222-8333-444455556666")}/k2j3h4`;
    expect(isOwnMedia(deliveryUrl("demo-church", "image", id))).toBe(true);
    expect(isOwnMedia(deliveryUrl("demo-church", "video", id))).toBe(true);
    expect(deliveryUrl("demo-church", "video", id)).toMatch(/\.mp4$/);
  });
});
