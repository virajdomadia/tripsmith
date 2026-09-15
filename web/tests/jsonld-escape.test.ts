import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { JsonLd } from '../src/components/seo/JsonLd';

it('escapes < so content cannot close the script tag', () => {
  const html = renderToStaticMarkup(createElement(JsonLd, { data: { name: '</script><b>' } }));
  expect(html).toContain('\\u003c/script>');
  expect(html).not.toContain('</script><b>');
});
