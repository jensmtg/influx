import { buildAncestorsAndDescendantsIndexes, parseIndentedText, reparentNode } from "./tree2";

const isEmpty = (val: any) => {
  if (val === undefined) {
    return true
  }
  else if (val && val.length === 0) {
    return true
  }
  return false
}



test('parseIndentedText should handle simple quotes', () => {

  const input =

    `>parent(> 0 spaces)\n` +        // 0000
    `>>child(>> 0 spaces)\n` +       // 0001
    `>> > child(>> 0 spaces)\n` +    // 0002
    `\n` +                           // 0003
    `> parent(> 1 spaces)\n` +       // 0004
    `>   child(> 3 spaces)\n` +      // 0005
    `>     child(> 5 spaces)\n` +    // 0006
    `>  child(> 1 tab)`              // 0007

  const is = parseIndentedText(input)
  // console.log(JSON.stringify(is, null, 2))

  expect(is.children["0000"]).toEqual(["0001"])
  expect(is.children["0001"]).toEqual(["0002"])
  expect(isEmpty(is.children["0004"])).toBeTruthy()

});


test('parseIndentedText should handle callouts', () => {

  const input =

    `>[!INFO] Basic callout\n` +                    // 0000
    `Mode determines inclusion of this line\n` +    // 0001
    `> and this.\n` +                               // 0002
    `\n` +                                          // 0003
    `>[!INFO] Root callout\n` +                     // 0004
    `Mode determines inclusion of this line\n` +    // 0005
    `>>[!INFO] Nested callout\n` +                  // 0006
    `>> Stripped?\n`                                // 0007

  const is1 = parseIndentedText(input)
  console.log(JSON.stringify(is1, null, 2))

  expect(is1.internals["0007"].stripped).toEqual("Stripped?")
  expect(is1.children["0000"]).toEqual(["0001", "0002"])
  expect(is1.children["0004"]).toEqual(["0005", "0006"])
  expect(is1.children["0006"]).toEqual(["0007"])


  // expect(is.children["0001"]).toEqual(["0002"])
  // expect(isEmpty(is.children["0004"])).toBeTruthy()

});


test('reparentNode should update relevant indexes', () => {

  const input =
    `- alpha\n` +         // 0000
    `  - bravo\n` +       // 0001
    `  - charlie\n` +     // 0002
    `     - delta\n` +    // 0003
    `       - omega\n`    // 0004

  const is1 = parseIndentedText(input)
  // console.log(JSON.stringify(is1, null, 2))

  expect(isEmpty(is1.children["0001"])).toBeTruthy()
  expect(is1.children["0002"]).toEqual(["0003"])
  expect(is1.parents["0003"]).toEqual("0002")
  expect(is1.parents["0004"]).toEqual("0003")
  expect(is1.children["0003"]).toEqual(["0004"])

  const is2 = reparentNode("0003", "0001", is1)
  // console.log(JSON.stringify(is2, null, 2))

  expect(is2.children["0001"]).toEqual(["0003"])
  expect(isEmpty(is2.children["0002"])).toBeTruthy()
  expect(is2.parents["0003"]).toEqual("0001")
  expect(is2.parents["0004"]).toEqual("0003")
  expect(is2.children["0003"]).toEqual(["0004"])

});


test('buildAncestorsAndDescendantsIndexes should work for ancestors', () => {

  const input =
    `- alpha\n` +         // 0000
    `  - bravo\n` +       // 0001
    `  - charlie\n` +     // 0002
    `     - delta\n`      // 0003


  const is = parseIndentedText(input)
  const { ancestors } = buildAncestorsAndDescendantsIndexes(is)

  // console.log('ans', JSON.stringify(ancestors, null, 2))

  expect(ancestors["0000"]).toEqual([])
  expect(ancestors["0001"]).toEqual(["0000"])
  expect(ancestors["0002"]).toEqual(["0000"])
  expect(ancestors["0003"]).toEqual(["0002", "0000"])


});


test('buildAncestorsAndDescendantsIndexes should work for descendants', () => {

  const input =
    `- alpha\n` +         // 0000
    `  - bravo\n` +       // 0001
    `  - charlie\n` +     // 0002
    `     - delta\n`      // 0003


  const is = parseIndentedText(input)
  const { descendants } = buildAncestorsAndDescendantsIndexes(is)

  // console.log('des', JSON.stringify(descendants, null, 2))

  expect(descendants["0000"]).toEqual(["0001", "0002", "0003"])
  expect(descendants["0001"]).toEqual([])
  expect(descendants["0002"]).toEqual(["0003"])
  expect(descendants["0003"]).toEqual([])


});