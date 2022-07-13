
const SHOW_ANCESTORS = true
const FRONTMATTER_KEY = 'tittel'


export const getInlinkedPages = (dv: any, currentPage: any) => {
  return currentPage.file.inlinks
    .map((link: any) => dv.page(link.path))
    .sort((p: any) => p.file.day, 'desc')
}

export const makeSubtrees = async (dv: any, currentPage: any, inlinkedPages: any) => {

 const ret: any = []

  await Promise.all(inlinkedPages.map(async (p: any, i: number) => {

    const subtrees: any[] = []
    const reparse: string[] = []
    //let reparse = ''

    const saveSubtree = (tree: any, ancestors: any[]) => { subtrees.push([tree, ancestors]) }
    const saveReparse = (text: string, index: number) => { reparse[index] = (reparse[index] || '') + text }

    const file = await dv.app.vault.getAbstractFileByPath(p.file.path)
    const content = await dv.app.vault.read(file)

    const metadata = dv.app.metadataCache.getFileCache(file);
    const titleByFrontmatterAttribute = metadata?.frontmatter?.[FRONTMATTER_KEY]
    const titleByFirstHeader = metadata?.headings?.[0]?.heading
    const title = titleByFrontmatterAttribute || titleByFirstHeader || ''

    const searchStrings = [asLink(currentPage.file.name)]
    const tree = doTree(content)

    console.log('tree', tree)


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

    ret[i] = {
      fileName: p.file.name,
      title: title,
    }


    if (searchStrings.some(str => title.includes(str))) {

      let fullReparse = ''
      for (let i = 0; i < tree.length; i++) {
        doReparseFullNote(tree[i], 0, (text: string) => {
          fullReparse = fullReparse + text
        })
      }
      ret[i].reparse = [fullReparse]

    }
    else {

      findSubtree(tree, searchStrings, saveSubtree, [])

      if (subtrees) {
        subtrees.forEach(([subtree, ancestors], i) => {
          if (SHOW_ANCESTORS) {
            doReparseAncestors(ancestors, 0, saveReparse, i)
            doReparse(subtree, ancestors.length, saveReparse, i)
          }
          else {
            doReparse(subtree, 0, saveReparse, i)
          }
        })
      }
  
      ret[i].reparse = reparse
      
    }

  }));

  return ret
}



const findSubtree = (nodes: any, searchStrings: string[], saveSubtree: (tree: any, ancestors: any[]) => void, ancestors: any[]) => {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (searchStrings.some(str => node.root.includes(str))) {
      // subtree = node
      saveSubtree(node, ancestors)
    }
    else if (node.content?.length > 0) {
      findSubtree(node.content, searchStrings, saveSubtree, [...ancestors, node])
    }
  }
}


const doReparseAncestors = (ancestors: any[], level: number, saveReparse: (text: string, index: number) => void, index: number) => {
  ancestors.forEach((node: any, j: number) => {
    const _level = level + j
    // console.log('n', node.root.substring(0, 2))
    const expectedBullet = node.root.substring(0, 2)
    const nodeString = expectedBullet === '* '
      ? `* <span class="ancestor">${node.root.slice(2)}</span>`
      : node.root
    saveReparse(`${' '.repeat(2 * _level)}${nodeString}\n`, index)
  })
}

const doReparse = (node: any, level: number, saveReparse: (text: string, index: number) => void, index: number) => {
  saveReparse(`${' '.repeat(2 * level)}${node.root}\n`, index)
  node.content.forEach((child: any) => doReparse(child, level + 1, saveReparse, index))
}

const doReparseFullNote = (node: any, level: number, saveReparse: (text: string) => void) => {
  saveReparse(`${' '.repeat(2 * level)}${node.root}\n`)
  node.content.forEach((child: any) => doReparseFullNote(child, level + 1, saveReparse))
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