import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeText, extractWanted } from "./files";
import { TAKEOUT_WANTED } from "./parsers/takeout";

describe("extractWanted", () => {
  it("pulls only wanted entries out of a zip and passes matching plain files through", async () => {
    const zip = zipSync({
      "Takeout/Chrome/BrowserHistory.json": strToU8('{"Browser History":[]}'),
      "Takeout/My Activity/Search/MyActivity.json": strToU8("[]"),
      "Takeout/Google Photos/IMG_0001.jpg": strToU8("not opened"),
    });
    const { files, ignored } = await extractWanted(
      [new File([zip], "takeout-001.zip"), new File(["[]"], "watch-history.json"), new File(["x"], "notes.txt")],
      TAKEOUT_WANTED,
    );
    expect(files.map((f) => f.name).sort()).toEqual(["Chrome/BrowserHistory.json", "Search/MyActivity.json", "watch-history.json"]);
    expect(decodeText(files.find((f) => f.name.startsWith("Chrome"))!.bytes)).toBe('{"Browser History":[]}');
    expect(ignored).toEqual(["notes.txt"]);
  });
});
