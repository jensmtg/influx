import { lexer, relexer } from "./treeUtils";



test('Frontmatter should be stripped', () => {

  const input = `
---
tag: alias
key: val
---
hello world
`.trim()

  const expected = `
hello world
`.trim()

  const tokens = lexer(input)
  const output = relexer(tokens)
  expect(output).toEqual(expected)

});



test('Should handle Tokens.Code', () => {

  const input = `
\`\`\`js
hello world
\`\`\` 
`.trim()

  const tokens = lexer(input)
  const output = relexer(tokens)
  expect(output).toEqual(input)

});



test('Should handle Tokens.Heading', () => {

  const input = `
# hello
## world
lorem ipsum
`.trim()

  const tokens = lexer(input)
  const pretty = JSON.stringify(tokens, null, 4)
  console.log(pretty);
  const output = relexer(tokens)
  console.log(output);
  expect(output).toEqual(input)

});

export { }

