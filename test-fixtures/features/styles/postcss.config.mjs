// The project's own PostCSS configuration: one plugin that marks every stylesheet it ran on.
export default {
  plugins: [
    {
      postcssPlugin: 'fixture-marker',
      Once(root, { decl, rule }) {
        root.append(rule({ selector: '.postcss-fixture-marker' }).append(decl({ prop: 'color', value: 'green' })));
      }
    }
  ]
};
