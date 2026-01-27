import { Model } from "../types";

export function createDAG(filteredModels: readonly Model[], rootModel: Model) {
  const dag: Record<string, Set<string>> = {
    [rootModel.name]: new Set<string>(),
  };

  filteredModels = filteredModels.filter((m) => m.name !== rootModel.name);

  for (const model of filteredModels) {
    dag[model.name] = new Set<string>();

    const relationFields = model.fields.filter((f) => f.kind === "object" && !f.isList);
    for (const field of relationFields) {
      if (dag[field.type]) {
        dag[model.name].add(field.type);
      }
    }
  }

  validateRootAuthority(dag, rootModel);
  checkForCycles(dag);
  return dag;
}

function validateRootAuthority(dag: Record<string, Set<string>>, rootModel: Model) {
  // Build reverse DAG to check if all nodes can reach the root
  const reverseDag: Record<string, Set<string>> = {};
  for (const node of Object.keys(dag)) {
    reverseDag[node] = new Set<string>();
  }

  for (const node of Object.keys(dag)) {
    for (const neighbor of dag[node]) {
      reverseDag[neighbor].add(node);
    }
  }

  const visited = new Set<string>();
  const stack = [rootModel.name];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!visited.has(current)) {
      visited.add(current);
      for (const neighbor of reverseDag[current]) {
        stack.push(neighbor);
      }
    }
  }

  const allNodes = Object.keys(dag);
  for (const node of allNodes) {
    if (!visited.has(node)) {
      throw new Error(
        `Not all models can reach the root model "${rootModel.name}". Model "${node}" cannot reach root.`
      );
    }
  }
}

function checkForCycles(dag: Record<string, Set<string>>) {
  const visited = new Set<string>();
  const recStack = new Set<string>();

  const visit = (node: string): boolean => {
    if (!visited.has(node)) {
      visited.add(node);
      recStack.add(node);

      for (const neighbor of dag[node]) {
        if (!visited.has(neighbor) && visit(neighbor)) {
          return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }
    }
    recStack.delete(node);
    return false;
  };

  for (const node of Object.keys(dag)) {
    if (visit(node)) {
      throw new Error(`Cycle detected in the model relationships involving model "${node}".`);
    }
  }
}
