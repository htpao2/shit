import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);
const its = nlp.its;
const stopTerms = /* @__PURE__ */ new Set([
  "how",
  "what",
  "when",
  "where",
  "upgrade",
  "update",
  "new",
  "latest",
  "can",
  "i",
  "to",
  "in",
  "for",
  "with",
  "the",
  "a",
  "an"
]);
function extractKeyword(text) {
  const doc = nlp.readDoc(text);
  const candidates = [];
  doc.tokens().each((t) => {
    const pos = t.out(its.pos);
    const value = t.out(its.normal);
    if ((pos === "NOUN" || pos === "PROPN") && !stopTerms.has(value)) {
      candidates.push(value);
    }
  });
  return candidates[0];
}

export { extractKeyword };
