const AboutPage = require("../models/AboutPage");

const getOrCreateAboutPage = async () => {
  let aboutPage = await AboutPage.findOne();
  if (!aboutPage) aboutPage = await AboutPage.create({});
  return aboutPage;
};

const withoutAdminNotes = (value) => {
  if (Array.isArray(value)) return value.map(withoutAdminNotes);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "sourceNote")
    .map(([key, entry]) => [key, withoutAdminNotes(entry)]));
};

const visibleOrdered = (items, visibilityKey) => (Array.isArray(items) ? items : [])
  .filter((item) => item?.[visibilityKey] !== false)
  .sort((first, second) => (first.order || 0) - (second.order || 0));

const publicAboutContent = (aboutPage) => {
  if (!aboutPage?.isPublished) return null;
  const content = aboutPage.published?.toObject
    ? aboutPage.published.toObject({ versionKey: false })
    : structuredClone(aboutPage.published || {});

  content.practices = visibleOrdered(content.practices, "visible");
  content.timeline = visibleOrdered(content.timeline, "published");
  content.publicWorks = visibleOrdered(content.publicWorks, "visible");
  content.awards = visibleOrdered(content.awards, "visible");
  content.pressArchive = visibleOrdered(content.pressArchive, "published").slice(0, 12);
  return withoutAdminNotes(content);
};

module.exports = { getOrCreateAboutPage, publicAboutContent };
