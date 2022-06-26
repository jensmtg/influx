
export const getInlinkedPages = (dv: any, currentPage: any) => {
  return currentPage.file.inlinks
    .map((link: any) => dv.page(link.path))
    .sort((p: any) => p.file.day, 'desc')
}

export const makeSubtrees = async (dv: any, currentPage: any, inlinkedPages: any) => {
  const ret: any = []

  await Promise.all(inlinkedPages.map(async (p: any, i: number) => {

    let subtree
    let reparse = ''

    const saveSubtree = (tree: any) => { subtree = tree }
    const saveReparse = (text: string) => { reparse = reparse + text }

    const file = await dv.app.vault.getAbstractFileByPath(p.file.path)
    const content = await dv.app.vault.read(file)

    console.log('curr', currentPage)

    const searchStrings = [asLink(currentPage.file.name)]
    const tree = doTree(content)

    // Add any aliases to the array of ids to search for
    if (currentPage.alias) {
      if (typeof currentPage.alias === 'string') {
        searchStrings.push(asLink(`${currentPage.file.name}|${currentPage.alias}`))
      }
      else {
        currentPage.alias.forEach((str: string) => searchStrings.push(asLink(`${currentPage.file.name}|${str}`)))
      }
    }

    console.log('searchstrings', searchStrings)

    findSubtree(tree, searchStrings, saveSubtree)

    if (subtree) {
      doReparse(subtree, 1, saveReparse)
    }

    ret[i] = {
      fileName: p.file.name,
      reparse: reparse
    }

  }));

  return ret
}



const findSubtree = (nodes: any, searchStrings: string[], saveSubtree: (tree: any) => void) => {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (searchStrings.some(str => node.root.includes(str))) {
      // subtree = node
      saveSubtree(node)
      break;
    }
    else if (node.content?.length > 0) {
      findSubtree(node.content, searchStrings, saveSubtree)
    }
  }
}


const doReparse = (node: any, level: number, saveReparse: (text?: string) => void) => {
  saveReparse(`${' '.repeat(2 * level)}${node.root}\n`)
  node.content.forEach((child: any) => doReparse(child, level + 1, saveReparse))
}

// https://stackoverflow.com/a/70338823
const indentation = (() => {

  const indents: any[] = []
  let max = -1

  return {
    clear: () => {
      indents.length = 0
      max = -1
    },
    get: (line: any, lNum: number | string = '?') => {
      const ncBefore = line.search(/\S/)
      let level = indents.indexOf(ncBefore)
      if (level === -1) {
        if (ncBefore < max) throw `error on indentation,\n line = ${lNum},\n line value is = "${line}"`
        level = indents.push(ncBefore) - 1
        max = ncBefore
      }
      return level
    }
  }
})()


// https://stackoverflow.com/a/70338823
const doTree = (data: any) => {
  const res: any[] = []
  const levels = [res]
  let lineN = 0

  indentation.clear()

  for (const line of data.split('\n')) {
    lineN++  // line counter for indent error message
    const root = line.trim()
    const content: any[] = []

    if (!root) continue
    let level = indentation.get(line, lineN)

    levels[level].push({ root, content })
    levels[++level] = content
  }
  return res
}

const asLink = (str: string) => `[[${str}]]`