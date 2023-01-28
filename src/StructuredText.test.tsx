import { StructuredText } from "./StructuredText";

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

  const struct = new StructuredText(input)

  // console.log(JSON.stringify(struct, null, 2))
  // console.log('str\n', struct.stringify())

  expect(struct.children["0000"]).toEqual(["0001"])
  expect(struct.children["0001"]).toEqual(["0002"])
  expect(isEmpty(struct.children["0004"])).toBeTruthy()

});


test('parseIndentedText should handle callouts', () => {

  const input =

    `>[!INFO] Basic callout\n` +                    // 0000 -- 0
    `Mode determines inclusion of this line\n` +    // 0001 -- 0 + 1
    `> and this.\n` +                               // 0002 -- 0 + 1
    `\n` +                                          // 0003
    `>[!INFO] Root callout\n` +                     // 0004 -- 0
    `Mode determines inclusion of this line\n` +    // 0005 -- 0 + 1
    `>>[!INFO] Nested callout\n` +                  // 0006 -- 1
    `>> Stripped?\n` +                              // 0007 -- 1 + 1
    `> Lower level\n`                               // 0008 -- 0 + 1

  const struct = new StructuredText(input)
  // console.log(JSON.stringify(struct, null, 2))
  // console.log('str\n', struct.stringify())

  expect(struct.internals["0007"].stripped).toEqual("Stripped?")
  expect(struct.children["0000"]).toEqual(["0001", "0002"])
  expect(struct.children["0004"]).toEqual(["0005", "0006", "0008"])
  expect(struct.children["0006"]).toEqual(["0007"])

});


test('reparentNode should update relevant indexes', () => {

  const input =
    `- alpha\n` +         // 0000
    `  - bravo\n` +       // 0001
    `  - charlie\n` +     // 0002
    `     - delta\n` +    // 0003
    `       - omega\n`    // 0004

  const struct = new StructuredText(input)
  // console.log(JSON.stringify(struct, null, 2))
  // console.log('str\n', struct.stringify())

  expect(isEmpty(struct.children["0001"])).toBeTruthy()
  expect(struct.children["0002"]).toEqual(["0003"])
  expect(struct.parents["0003"]).toEqual("0002")
  expect(struct.parents["0004"]).toEqual("0003")
  expect(struct.children["0003"]).toEqual(["0004"])

  struct.reparentNode("0003", "0001")
  // console.log(JSON.stringify(is2, null, 2))

  expect(struct.children["0001"]).toEqual(["0003"])
  expect(isEmpty(struct.children["0002"])).toBeTruthy()
  expect(struct.parents["0003"]).toEqual("0001")
  expect(struct.parents["0004"]).toEqual("0003")
  expect(struct.children["0003"]).toEqual(["0004"])

});


test('buildAncestorsAndDescendantsIndexes should work for ancestors', () => {

  const input =
    `- alpha\n` +         // 0000
    `  - bravo\n` +       // 0001
    `  - charlie\n` +     // 0002
    `     - delta\n`      // 0003


  const struct = new StructuredText(input)

  expect(struct.ancestors["0000"]).toEqual([])
  expect(struct.ancestors["0001"]).toEqual(["0000"])
  expect(struct.ancestors["0002"]).toEqual(["0000"])
  expect(struct.ancestors["0003"]).toEqual(["0002", "0000"])


});


test('buildAncestorsAndDescendantsIndexes should work for descendants', () => {

  const input =
    `- alpha\n` +         // 0000
    `  - bravo\n` +       // 0001
    `  - charlie\n` +     // 0002
    `     - delta\n`      // 0003


  const struct = new StructuredText(input)

  expect(struct.descendants["0000"]).toEqual(["0001", "0002", "0003"])
  expect(struct.descendants["0001"]).toEqual([])
  expect(struct.descendants["0002"]).toEqual(["0003"])
  expect(struct.descendants["0003"]).toEqual([])


});




test('Should handle bullet lists inside callouts', () => {

  const input =

    `> [!INFO] Callout \n` +        // 0000
    `> * Parent \n` +               // 0001
    `>   * Child A \n` +              // 0002
    `>   * Child B \n`                // 0003

  const struct = new StructuredText(input)

  // console.log(JSON.stringify(struct, null, 2))
  // console.log('str\n', struct.stringify())

  expect(struct.children["0000"]).toEqual(["0001"])
  expect(struct.children["0001"]).toEqual(["0002", "0003"])


});

