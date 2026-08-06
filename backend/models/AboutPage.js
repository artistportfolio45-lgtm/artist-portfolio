const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema({
  url: { type: String, trim: true, default: "" },
  publicId: { type: String, trim: true, default: "" },
  alt: { type: String, trim: true, default: "" },
  caption: { type: String, trim: true, default: "" },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
}, { _id: false });

const heroSchema = new mongoose.Schema({
  eyebrow: { type: String, default: "Indian Visual Artist" },
  name: { type: String, default: "Dr. Gurugovind Namdev Ambe" },
  roles: { type: String, default: "Painter · Sculptor · Muralist · Illustrator · Art Educator" },
  introduction: { type: String, default: "A multi-disciplinary Indian artist whose practice spans painting, sculpture, murals, illustration, socially engaged cartoons and arts education." },
  backgroundImage: { type: mediaSchema, default: () => ({}) },
  showCollectionButton: { type: Boolean, default: true },
  visible: { type: Boolean, default: true },
}, { _id: false });

const statementSchema = new mongoose.Schema({
  quote: { type: String, default: "" },
  statement: { type: String, default: "His work explores Indian culture, history, spirituality, public life, social awareness and the breadth of human experience." },
  signatureText: { type: String, default: "" },
  signatureImage: { type: mediaSchema, default: () => ({}) },
  supportingImage: { type: mediaSchema, default: () => ({}) },
  visible: { type: Boolean, default: true },
}, { _id: false });

const biographySchema = new mongoose.Schema({
  heading: { type: String, default: "A life shaped through art" },
  body: { type: String, default: "Dr. Gurugovind Namdev Ambe is a painter, sculptor, muralist, illustrator, cartoonist, art educator and fine-arts curator. His practice moves between the intimacy of drawing and painting and the shared civic space of murals, memorial work and public sculpture.\n\nHe achieved first position at the Pune centre in G.D. Art and ninth position in the Maharashtra merit list. His works “Anpadh Ki Dasha” and “Buddha Ka Shodhan Ke Liye Rajya Tyag” received national recognition. Archive material documents a wider practice encompassing ceramic and terracotta work, installations and socially engaged visual communication." },
  archiveNote: { type: String, default: "Earlier archive and media material may refer to the artist as G. N. Ambe or Raju Ambe." },
  image: { type: mediaSchema, default: () => ({}) },
  visible: { type: Boolean, default: true },
}, { _id: false });

const practiceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  image: { type: mediaSchema, default: () => ({}) },
  link: { type: String, default: "" },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

const timelineSchema = new mongoose.Schema({
  dateLabel: { type: String, default: "" },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  category: { type: String, enum: ["Education", "Award", "Exhibition", "Public Artwork", "Career Milestone"], default: "Career Milestone" },
  image: { type: mediaSchema, default: () => ({}) },
  sourceNote: { type: String, default: "" },
  published: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

const processStepSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  image: { type: mediaSchema, default: () => ({}) },
  icon: { type: String, default: "" },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

const studioSchema = new mongoose.Schema({
  description: { type: String, default: "" },
  images: { type: [mediaSchema], default: [] },
  visible: { type: Boolean, default: true },
}, { _id: false });

const publicWorkSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  year: { type: String, default: "" },
  location: { type: String, default: "" },
  medium: { type: String, default: "" },
  description: { type: String, default: "" },
  images: {
    type: [mediaSchema],
    default: [],
    validate: { validator: (images) => images.length <= 10, message: "Public works support up to 10 images" },
  },
  relatedArtworks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Artwork" }],
  sourceNote: { type: String, default: "" },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

const awardSchema = new mongoose.Schema({
  awardTitle: { type: String, required: true, trim: true },
  artworkTitle: { type: String, default: "" },
  year: { type: String, default: "" },
  organiser: { type: String, default: "" },
  location: { type: String, default: "" },
  description: { type: String, default: "" },
  image: { type: mediaSchema, default: () => ({}) },
  sourceNote: { type: String, default: "" },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

const pressSchema = new mongoose.Schema({
  publicationName: { type: String, required: true, trim: true },
  publicationDate: { type: String, default: "" },
  headline: { type: String, default: "" },
  originalLanguage: { type: String, default: "" },
  englishSummary: { type: String, default: "" },
  image: { type: mediaSchema, default: () => ({}) },
  articleUrl: { type: String, default: "" },
  sourceNote: { type: String, default: "" },
  published: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

const closingSchema = new mongoose.Schema({
  eyebrow: { type: String, default: "The work continues" },
  heading: { type: String, default: "Art as memory, witness and shared experience" },
  message: { type: String, default: "Across disciplines and public spaces, the artist’s practice remains rooted in culture, social awareness and the enduring human impulse to make meaning." },
  backgroundImage: { type: mediaSchema, default: () => ({}) },
  showCollectionButton: { type: Boolean, default: true },
  showContactButton: { type: Boolean, default: true },
  visible: { type: Boolean, default: true },
}, { _id: false });

const seoSchema = new mongoose.Schema({
  title: { type: String, default: "Dr. Gurugovind Namdev Ambe — Indian Visual Artist" },
  description: { type: String, default: "Discover the multi-disciplinary practice, public works, honours and archive of Indian artist Dr. Gurugovind Namdev Ambe." },
  socialImage: { type: mediaSchema, default: () => ({}) },
}, { _id: false });

const contentSchema = new mongoose.Schema({
  hero: { type: heroSchema, default: () => ({}) },
  artistStatement: { type: statementSchema, default: () => ({}) },
  biography: { type: biographySchema, default: () => ({}) },
  practices: { type: [practiceSchema], default: () => [
    { title: "Painting & Drawing", description: "Paintings and sketches shaped by Indian culture, history, spirituality and lived experience.", order: 0 },
    { title: "Sculpture & Ceramics", description: "Sculptural, ceramic and terracotta works that bring material, memory and form into dialogue.", order: 1 },
    { title: "Murals & Public Art", description: "Memorial works, murals and public projects conceived for shared spaces and collective remembrance.", order: 2 },
    { title: "Illustration & Social Cartoons", description: "Illustration and socially engaged cartoons addressing public life, awareness and human dignity.", order: 3 },
  ] },
  timeline: { type: [timelineSchema], default: () => [
    { title: "G.D. Art recognition", description: "First position at the Pune centre and ninth position in the Maharashtra merit list.", category: "Education", sourceNote: "Add the verified year and archival proof before expanding this entry.", order: 0 },
    { title: "Public and memorial art practice", description: "A significant body of murals, memorial-site work, sculpture and installations created for public contexts.", category: "Public Artwork", sourceNote: "Add verified project dates and locations from the archive.", order: 1 },
    { title: "National recognition for “Anpadh Ki Dasha”", description: "The work received national recognition for its socially engaged artistic vision.", category: "Award", sourceNote: "Add the verified date, organiser and proof image.", order: 2 },
    { title: "National painting recognition", description: "“Buddha Ka Shodhan Ke Liye Rajya Tyag” received national painting recognition.", category: "Award", sourceNote: "Add the verified date, organiser and proof image.", order: 3 },
  ] },
  publicWorks: { type: [publicWorkSchema], default: [] },
  awards: { type: [awardSchema], default: () => [
    { awardTitle: "National recognition", artworkTitle: "Anpadh Ki Dasha", description: "National recognition for a socially engaged work.", sourceNote: "Verify date, organiser and location from archival proof.", order: 0 },
    { awardTitle: "National painting recognition", artworkTitle: "Buddha Ka Shodhan Ke Liye Rajya Tyag", description: "National recognition for the painting.", sourceNote: "Verify date, organiser and location from archival proof.", order: 1 },
  ] },
  pressArchive: { type: [pressSchema], default: [] },
  process: { type: [processStepSchema], default: () => [] },
  studio: { type: studioSchema, default: () => ({}) },
  closingCta: { type: closingSchema, default: () => ({}) },
  seo: { type: seoSchema, default: () => ({}) },
}, { _id: false });

const aboutPageSchema = new mongoose.Schema({
  draft: { type: contentSchema, default: () => ({}) },
  published: { type: contentSchema, default: () => ({}) },
  isPublished: { type: Boolean, default: true },
  publishedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, trim: true, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("AboutPage", aboutPageSchema);
