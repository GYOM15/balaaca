import next from "eslint-config-next";

/**
 * `next lint` is gone in Next 16, so ESLint is invoked directly and this file
 * is what it reads. The Next preset is the whole ruleset on purpose: what is
 * worth catching here is React's own hazards and this framework's, and a
 * hand-picked list would be a second opinion nobody maintains.
 */
const config = [
  { ignores: [".next/**", "src/generated/**", "node_modules/**"] },
  ...next,
  {
    rules: {
      // Off, and only for this product's reason. The rule exists to catch a
      // stray quote that was meant to be markup; every one of the twenty-six
      // it found here is a French apostrophe in a sentence a customer reads -
      // "l'activite", "jusqu'a", "n'a pas abouti". Escaping them all would
      // make the prose unreadable in the source to guard against a mistake
      // that cannot happen in it.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default config;
