


export type NodeId = string;
  interface NodeInternal {
    raw: string;
  }
  
  export function parseIndentedText(text: string): any {
    const lines = text.split('\n');
    const indexes: any = {}
    const internals: { [key: NodeId]: NodeInternal } = {}
    const indentLevel: { [key: number]: NodeId[] } = {}
    const children: { [key: NodeId]: NodeId[] } = {}
    const descendants: { [key: NodeId]: NodeId[] } = {}
    const ancestors: { [key: NodeId]: NodeId[] } = {}

    let stack: NodeId[] = []

    
    const trimStack = (stack: NodeId[]) => {
        let ret = [...stack]
        for (let i = stack.length; i > 0; i--) {
            if (!ret[i]) {
                ret = ret.slice(0, i)
            }
            else {
                break;
            }
        }
        return ret
    }

    const lastNonEmptyElement = (stack: NodeId[], offset = 0): NodeId | null => {
        let ret = [...stack].slice(0, -offset)
        for (let i = stack.length; i >= 0; i--) {
            if (!ret[i]) {
                ret = ret.slice(0, i)
            }
            else {
                return ret[i]
            }
        }
        return null
    }

    for (let i = 0; i < lines.length; i++) {

        const line = lines[i]
        const indent = line.search(/\S|$/);
        const id: NodeId = `${i}`.padStart(4, '0')

        internals[id] = {raw: line};
        (indentLevel[indent] ||= []).push(id)

        if (indent >= stack.length - 1) {
            stack[indent] = id
        }
        else {
            stack = stack.slice(0, indent + 1)
            stack[indent] = id
        }

        const parentId = lastNonEmptyElement(stack, 1)
        if (parentId) {
            (children[parentId] ||= []).push(id);
        }

        const ancestorIds = stack.filter(i => !!i && i !== id);
        ancestors[id] = ancestorIds;
        ancestorIds.forEach(aId => {
            (descendants[aId] ||= []).push(id)
        })


        console.log('s', stack, stack.length, indent)
    }



    return {
        internals,
        indentLevel,
        children,
        descendants,
        ancestors
    };
  }
  