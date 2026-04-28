import { describe, expect, it } from "vitest";
import { ADMIN_HELP_TOPICS, getAllowedHelpTopics, getHelpTopicById } from "./AdminHelp";

describe("admin help topics", () => {
  it("shows only operable help pages to managers", () => {
    const topics = getAllowedHelpTopics("manager");

    expect(topics.map((topic) => topic.id)).toEqual(["dashboard", "shifts", "corrections"]);
    expect(topics.every((topic) => topic.roles.includes("manager"))).toBe(true);
  });

  it("shows every help page to admins", () => {
    const topics = getAllowedHelpTopics("admin");

    expect(topics).toHaveLength(ADMIN_HELP_TOPICS.length);
    expect(topics.map((topic) => topic.id)).toContain("exports");
    expect(topics.map((topic) => topic.id)).toContain("audit");
  });

  it("finds a topic by its URL id", () => {
    expect(getHelpTopicById("shifts")?.route).toBe("/admin/shifts");
    expect(getHelpTopicById("missing")).toBeUndefined();
  });
});
