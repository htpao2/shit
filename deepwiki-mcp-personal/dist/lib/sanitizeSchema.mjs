import { defaultSchema } from 'hast-util-sanitize';

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (t) => !["img", "script", "style", "header", "footer", "nav"].includes(t)
  ),
  attributes: {
    ...defaultSchema.attributes,
    "*": (defaultSchema.attributes?.["*"] ?? []).filter(
      (attr) => !["style", "onload", "onclick"].includes(attr)
    )
  }
};

export { sanitizeSchema };
