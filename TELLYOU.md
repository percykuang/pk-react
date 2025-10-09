# React 核心实现架构详解

> 本文档详细阐述了本项目从零实现 React 核心机制的完整流程，包括 Fiber 架构、调和算法、渲染流程等。

---

## 📚 目录

- [1. 整体架构概览](#1-整体架构概览)
- [2. 核心数据结构](#2-核心数据结构)
- [3. 完整执行流程](#3-完整执行流程)
- [4. 详细函数注解](#4-详细函数注解)
- [5. 关键算法解析](#5-关键算法解析)
- [6. 调试指南](#6-调试指南)

---

## 1. 整体架构概览

### 1.1 Monorepo 结构

```
packages/
├── react                  # React API 层（JSX 转换）
│   ├── index.ts          # 导出 createElement
│   └── src/jsx.ts        # JSX 转换实现
├── react-dom              # DOM 渲染器
│   ├── client.ts         # 导出 createRoot
│   └── src/
│       ├── root.ts       # createRoot 实现
│       └── hostConfig.ts # 宿主环境配置（DOM 操作）
├── react-reconciler       # 核心调和器（Fiber 架构）
│   └── src/
│       ├── workLoop.ts        # 工作循环调度
│       ├── fiber.ts           # Fiber 数据结构
│       ├── beginWork.ts       # Render 阶段 - 递
│       ├── completeWork.ts    # Render 阶段 - 归
│       ├── childFibers.ts     # Diff 算法
│       ├── commitWork.ts      # Commit 阶段
│       ├── fiberHooks.ts      # Hooks 实现
│       └── updateQueue.ts     # 更新队列
└── shared                 # 公共类型定义
    ├── ReactTypes.ts     # TypeScript 类型
    └── ReactSymbols.ts   # 内部符号常量
```

### 1.2 执行流程总览

```
用户代码: <App />
    ↓
[1] JSX 编译
    ↓
jsxDEV() → ReactElement 对象
    ↓
[2] 应用启动
    ↓
ReactDOM.createRoot(container).render(element)
    ↓
createContainer → updateContainer
    ↓
[3] 调度更新
    ↓
scheduleUpdateOnFiber → renderRoot
    ↓
[4] Render 阶段（可中断，构建 Fiber 树）
    ↓
workLoop → performUnitOfWork
    ├─→ beginWork（递）：创建子 Fiber
    └─→ completeWork（归）：创建 DOM、收集副作用
    ↓
[5] Commit 阶段（不可中断，提交到 DOM）
    ↓
commitRoot → commitMutationEffects
    ↓
将 DOM 插入容器，完成渲染
```

---

## 2. 核心数据结构

### 2.1 ReactElement（虚拟 DOM）

**文件**: `packages/react/src/jsx.ts:11-26`

```typescript
interface ReactElement {
  $$typeof: symbol;        // REACT_ELEMENT_TYPE，用于安全校验
  type: string | Function; // 'div' | FunctionComponent
  key: string | null;      // 列表 Diff 的关键
  ref: Ref | null;         // 引用
  props: {                 // 属性对象
    children?: ReactElement | ReactElement[] | string;
    [key: string]: any;
  };
  __mark: 'pk-react';      // 自定义标记
}
```

**作用**: JSX 的运行时表示，描述了 UI 结构但还不是真实 DOM。

---

### 2.2 FiberNode（工作单元）

**文件**: `packages/react-reconciler/src/fiber.ts:7-62`

```typescript
class FiberNode {
  // ========== 静态属性 ==========
  tag: WorkTag;              // 节点类型标签
  type: any;                 // 组件类型（'div' 或 FunctionComponent）
  key: Key;                  // Diff 算法的 key
  stateNode: any;            // 关联的真实 DOM 节点

  // ========== 树形结构 ==========
  return: FiberNode | null;  // 父节点
  child: FiberNode | null;   // 第一个子节点
  sibling: FiberNode | null; // 下一个兄弟节点
  index: number;             // 在兄弟节点中的位置

  // ========== 工作单元 ==========
  pendingProps: Props;       // 即将生效的 props
  memoizedProps: Props;      // 上次渲染的 props
  memoizedState: any;        // 上次渲染的 state
  updateQueue: unknown;      // 更新队列

  // ========== 双缓存 ==========
  alternate: FiberNode | null; // 指向另一棵 Fiber 树的对应节点

  // ========== 副作用 ==========
  flags: Flags;              // 自身的副作用标记（Placement/Update/Deletion）
  subtreeFlags: Flags;       // 子树的副作用标记（收集用）
}
```

**WorkTag 类型** (`packages/react-reconciler/src/workTags.ts`):
```typescript
export const FunctionComponent = 0; // 函数组件
export const HostRoot = 3;          // 根节点
export const HostComponent = 5;     // 原生 DOM 标签（div/span）
export const HostText = 6;          // 文本节点
```

**Flags 副作用标记** (`packages/react-reconciler/src/fiberFlags.ts`):
```typescript
export const NoFlags = 0b0000000;      // 无副作用
export const Placement = 0b0000001;    // 插入
export const Update = 0b0000010;       // 更新
export const ChildDeletion = 0b0000100;// 删除子节点
```

---

### 2.3 FiberRootNode（根容器）

**文件**: `packages/react-reconciler/src/fiber.ts:64-75`

```typescript
class FiberRootNode {
  container: Container;           // 真实 DOM 容器（如 <div id="root">）
  current: FiberNode;             // 当前屏幕显示的 Fiber 树根节点
  finishedWork: FiberNode | null; // 本次更新完成的 Fiber 树根节点
}
```

**双缓存机制**:
```
FiberRootNode
    │
    ├─→ current (旧 Fiber 树，屏幕显示的)
    │      ↕ alternate
    └─→ finishedWork (新 Fiber 树，正在构建的)
```

---

## 3. 完整执行流程

### 阶段 1: JSX 编译与转换

**输入代码**:
```jsx
const App = () => <div><Child /></div>;
```

**编译后**:
```javascript
const App = () => jsxDEV('div', { children: jsxDEV(Child, {}) });
```

**执行流程**:
```
jsxDEV(type, config)                    // packages/react/src/jsx.ts:73
    ↓
遍历 config，提取 key/ref/props         // L78-101
    ↓
ReactElement(type, key, ref, props)     // L11
    ↓
返回 { $$typeof, type, key, ref, props }
```

---

### 阶段 2: 应用启动

**用户代码**:
```javascript
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
```

#### 函数调用链:

```
createRoot(container)                              // packages/react-dom/src/root.ts:11
    ↓
createContainer(container)                         // packages/react-reconciler/src/fiberReconciler.ts
    ↓
创建 HostRootFiber 和 FiberRootNode
    ↓
返回 { render(element) { updateContainer(...) } }
    ↓
render(<App />)                                    // packages/react-dom/src/root.ts:15
    ↓
updateContainer(element, root)                     // packages/react-reconciler/src/fiberReconciler.ts
    ↓
创建 Update 对象并加入更新队列
    ↓
scheduleUpdateOnFiber(hostRootFiber)              // packages/react-reconciler/src/workLoop.ts:14
```

---

### 阶段 3: Render 阶段（构建 Fiber 树）

**核心循环**:
```
renderRoot(root)                                   // packages/react-reconciler/src/workLoop.ts:33
    ↓
prepareFreshStack(root)                            // L10-12
    创建 workInProgress（新 Fiber 树的根节点）
    ↓
workLoop()                                         // L88-92
    while (workInProgress !== null) {
        performUnitOfWork(workInProgress)          // L94-103
    }
```

#### 3.1 performUnitOfWork（处理单个工作单元）

**文件**: `packages/react-reconciler/src/workLoop.ts:94-103`

```typescript
function performUnitOfWork(fiber: FiberNode) {
  // [1] 递阶段：创建子 Fiber 并返回
  const next = beginWork(fiber);

  // [2] 工作完成后，pendingProps 变为 memoizedProps
  fiber.memoizedProps = fiber.pendingProps;

  // [3] 如果没有子节点，进入归阶段
  if (next === null) {
    completeUnitWork(fiber);
  } else {
    // [4] 继续处理子节点
    workInProgress = next;
  }
}
```

**执行流程**:
```
App (FunctionComponent)
  ↓ beginWork → 返回 div
div (HostComponent)
  ↓ beginWork → 返回 p
p (HostComponent)
  ↓ beginWork → 返回 Child
Child (FunctionComponent)
  ↓ beginWork → 返回 h1
h1 (HostComponent)
  ↓ beginWork → 返回 "hello pk react"
text (HostText)
  ↓ beginWork → 返回 null
  ↓ completeWork(text) ← 开始归阶段
```

---

#### 3.2 beginWork（递阶段）

**文件**: `packages/react-reconciler/src/beginWork.ts:15-71`

```typescript
export const beginWork = (wip: FiberNode) => {
  // 根据 tag 类型处理不同节点
  switch (wip.tag) {
    case HostRoot:
      return updateHostRoot(wip);        // 根节点
    case HostComponent:
      return updateHostComponent(wip);   // 原生 DOM
    case HostText:
      return null;                       // 文本节点无子节点
    case FunctionComponent:
      return updateFunctionComponent(wip);// 函数组件
  }
};
```

##### 3.2.1 updateHostRoot（处理根节点）

**文件**: `packages/react-reconciler/src/beginWork.ts:40-51`

```typescript
function updateHostRoot(wip: FiberNode) {
  // [1] 获取上次的状态
  const baseState = wip.memoizedState;

  // [2] 获取更新队列
  const updateQueue = wip.updateQueue as UpdateQueue<Element>;
  const pending = updateQueue.shared.pending;

  // [3] 清空 pending，防止重复消费
  updateQueue.shared.pending = null;

  // [4] 计算新状态（执行 update.action）
  const { memoizedState } = processUpdateQueue(baseState, pending);
  wip.memoizedState = memoizedState;

  // [5] 新状态就是 ReactElement，reconcile 子节点
  const nextChildren = wip.memoizedState;
  reconcileChildren(wip, nextChildren);

  return wip.child;
}
```

**说明**: `memoizedState` 存储的是 `<App />` 这个 ReactElement。

---

##### 3.2.2 updateFunctionComponent（处理函数组件）

**文件**: `packages/react-reconciler/src/beginWork.ts:34-38`

```typescript
function updateFunctionComponent(wip: FiberNode) {
  // [1] 执行函数组件，获取返回的 ReactElement
  const nextChildren = renderWithHooks(wip);

  // [2] Diff 子节点
  reconcileChildren(wip, nextChildren);

  return wip.child;
}
```

**renderWithHooks** (`packages/react-reconciler/src/fiberHooks.ts`):
```typescript
export function renderWithHooks(wip: FiberNode) {
  // 获取组件类型（如 App 函数）
  const Component = wip.type;
  const props = wip.pendingProps;

  // 执行函数组件
  const children = Component(props);

  return children;
}
```

**示例**:
```javascript
// 输入: wip.type = App, wip.pendingProps = {}
// 执行: App({})
// 返回: <div><Child /></div> 的 ReactElement
```

---

##### 3.2.3 updateHostComponent（处理原生 DOM）

**文件**: `packages/react-reconciler/src/beginWork.ts:53-58`

```typescript
function updateHostComponent(wip: FiberNode) {
  // [1] 获取新的 props
  const nextProps = wip.pendingProps;

  // [2] children 在 props 中
  const nextChildren = nextProps.children;

  // [3] Diff 子节点
  reconcileChildren(wip, nextChildren);

  return wip.child;
}
```

---

##### 3.2.4 reconcileChildren（Diff 核心）

**文件**: `packages/react-reconciler/src/beginWork.ts:60-70`

```typescript
function reconcileChildren(wip: FiberNode, children: ReactElementType) {
  // 获取旧的子 Fiber
  const current = wip.alternate;

  if (current !== null) {
    // ====== Update 阶段 ======
    // 需要追踪副作用（标记删除、更新）
    wip.child = reconcileChildFibers(wip, current?.child, children);
  } else {
    // ====== Mount 阶段 ======
    // 不需要追踪副作用（只有根节点标记 Placement）
    wip.child = mountChildFibers(wip, null, children);
  }
}
```

**关键区别**:
- **mountChildFibers**: `shouldTrackEffects = false`，不标记 Placement
- **reconcileChildFibers**: `shouldTrackEffects = true`，标记所有副作用

**原因**: Mount 时只需在根节点标记 Placement，一次性插入整棵树。

---

#### 3.3 childFibers（Diff 算法）

**文件**: `packages/react-reconciler/src/childFibers.ts:8-75`

```typescript
function ChildReconciler(shouldTrackEffects: boolean) {

  // ===== 单节点 Diff =====
  function reconcileSingleElement(
    returnFiber: FiberNode,
    currentFiber: FiberNode | null,
    element: ReactElementType
  ) {
    // 根据 ReactElement 创建新 Fiber
    const fiber = createFiberFromElement(element);
    fiber.return = returnFiber;
    return fiber;
  }

  // ===== 文本节点 Diff =====
  function reconcileSingleTextNode(
    returnFiber: FiberNode,
    currentFiber: FiberNode | null,
    content: string | number
  ) {
    const fiber = new FiberNode(HostText, { content }, null);
    fiber.return = returnFiber;
    return fiber;
  }

  // ===== 标记插入 =====
  function placeSingleChild(fiber: FiberNode) {
    // Mount 阶段且是新创建的节点
    if (shouldTrackEffects && fiber.alternate === null) {
      fiber.flags |= Placement;
    }
    return fiber;
  }

  // ===== 主函数 =====
  return function reconcileChildFibers(
    returnFiber: FiberNode,
    currentFiber: FiberNode | null,
    newChild?: ReactElementType
  ) {
    // [1] 对象类型 - ReactElement
    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return placeSingleChild(
            reconcileSingleElement(returnFiber, currentFiber, newChild)
          );
      }
    }

    // [2] 文本节点
    if (typeof newChild === 'string' || typeof newChild === 'number') {
      return placeSingleChild(
        reconcileSingleTextNode(returnFiber, currentFiber, newChild)
      );
    }

    return null;
  };
}

export const reconcileChildFibers = ChildReconciler(true);  // Update
export const mountChildFibers = ChildReconciler(false);     // Mount
```

**流程图**:
```
reconcileChildFibers(wip, current.child, newChild)
    ↓
判断 newChild 类型
    ├─→ ReactElement → reconcileSingleElement
    ├─→ string/number → reconcileSingleTextNode
    └─→ 其他 → null
    ↓
placeSingleChild
    ↓
如果是 Mount 且无 alternate → 标记 Placement
```

---

#### 3.4 completeWork（归阶段）

**文件**: `packages/react-reconciler/src/completeWork.ts:18-101`

```typescript
export const completeWork = (wip: FiberNode) => {
  const newProps = wip.pendingProps;
  const current = wip.alternate;

  switch (wip.tag) {
    case HostComponent:
      if (current !== null && wip.stateNode) {
        // ====== Update ======
        // TODO: 更新属性
      } else {
        // ====== Mount ======
        // [1] 创建真实 DOM
        const instance = createInstance(wip.type); // document.createElement

        // [2] 将子节点的 DOM 插入
        appendAllChildren(instance, wip);

        // [3] 保存到 stateNode
        wip.stateNode = instance;
      }
      // [4] 收集副作用
      bubbleProperties(wip);
      return null;

    case HostText:
      if (current !== null && wip.stateNode) {
        // Update
      } else {
        // [1] 创建文本节点
        const instance = createTextInstance(newProps.content);
        wip.stateNode = instance;
      }
      bubbleProperties(wip);
      return null;

    case HostRoot:
    case FunctionComponent:
      // 这两种类型没有实际 DOM
      bubbleProperties(wip);
      return null;
  }
};
```

---

##### 3.4.1 appendAllChildren（插入子 DOM）

**文件**: `packages/react-reconciler/src/completeWork.ts:61-86`

```typescript
function appendAllChildren(parent: Container, wip: FiberNode) {
  let node = wip.child;

  while (node !== null) {
    // [1] 如果是原生 DOM 或文本节点，直接插入
    if (node.tag === HostComponent || node.tag === HostText) {
      appendInitialChild(parent, node?.stateNode);

    // [2] 如果是 FunctionComponent，需要向下找到真实 DOM
    } else if (node.child !== null) {
      node.child.return = node;
      node = node.child;
      continue;
    }

    if (node === wip) {
      return;
    }

    // [3] 没有兄弟节点，向上回溯
    while (node.sibling === null) {
      if (node.return === null || node.return === wip) {
        return;
      }
      node = node?.return;
    }

    // [4] 处理兄弟节点
    node.sibling.return = node.return;
    node = node.sibling;
  }
}
```

**示例**:
```
div.stateNode = <div></div>
  ↓ 遍历子节点
p (FunctionComponent，跳过)
  ↓ 继续向下
h1.stateNode = <h1></h1>
  ↓ 插入
text.stateNode = "hello"
  ↓ 插入到 h1
appendInitialChild(h1, "hello")
  ↓ 回溯到 div
appendInitialChild(div, h1)
```

---

##### 3.4.2 bubbleProperties（副作用冒泡）

**文件**: `packages/react-reconciler/src/completeWork.ts:88-100`

```typescript
function bubbleProperties(wip: FiberNode) {
  let subtreeFlags = NoFlags;
  let child = wip.child;

  // 遍历所有子节点
  while (child !== null) {
    // 收集子节点的副作用
    subtreeFlags |= child.subtreeFlags;
    subtreeFlags |= child.flags;

    child.return = wip;
    child = child.sibling;
  }

  // 保存到当前节点
  wip.subtreeFlags |= subtreeFlags;
}
```

**作用**: 将子树的所有副作用标记汇总到父节点，方便 Commit 阶段判断是否需要遍历子树。

**示例**:
```
text.flags = Placement
  ↓ bubbleProperties(h1)
h1.subtreeFlags = Placement
  ↓ bubbleProperties(div)
div.subtreeFlags = Placement
  ↓ commitRoot 时检查
if (div.subtreeFlags & MutationMask) {
  // 需要遍历子树执行副作用
}
```

---

#### 3.5 completeUnitWork（归阶段循环）

**文件**: `packages/react-reconciler/src/workLoop.ts:105-119`

```typescript
function completeUnitWork(fiber: FiberNode) {
  let node: FiberNode | null = fiber;

  do {
    // [1] 完成当前节点
    completeWork(node);

    // [2] 如果有兄弟节点，处理兄弟节点
    const sibling = node.sibling;
    if (sibling !== null) {
      workInProgress = sibling;
      return;
    }

    // [3] 没有兄弟节点，回到父节点
    node = node.return;
    workInProgress = null;
  } while (node !== null);
}
```

**遍历顺序**（深度优先后序遍历）:
```
App
├─ div
│  └─ p
│     └─ Child
│        └─ h1
│           └─ "hello"
                  ↑ 从这里开始 completeWork
                  ↓
              h1 → Child → p → div → App
```

---

### 阶段 4: Commit 阶段（提交副作用）

**入口**: `packages/react-reconciler/src/workLoop.ts:55-86`

```typescript
function commitRoot(root: FiberRootNode) {
  const finishedWork = root.finishedWork;

  if (finishedWork === null) {
    return;
  }

  // [1] 重置
  root.finishedWork = null;

  // [2] 判断是否有副作用需要执行
  const subtreeHasEffect = (finishedWork.subtreeFlags & MutationMask) !== NoFlags;
  const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

  if (subtreeHasEffect || rootHasEffect) {
    // ====== 三个子阶段 ======

    // beforeMutation（暂未实现）

    // [3] Mutation 阶段：执行 DOM 操作
    commitMutationEffects(finishedWork);

    // [4] 切换 Fiber 树
    root.current = finishedWork;

    // Layout 阶段（暂未实现）
  } else {
    root.current = finishedWork;
  }
}
```

---

#### 4.1 commitMutationEffects（遍历副作用）

**文件**: `packages/react-reconciler/src/commitWork.ts:9-35`

```typescript
export const commitMutationEffects = (finishedWork: FiberNode) => {
  nextEffect = finishedWork;

  while (nextEffect !== null) {
    // [1] 向下遍历，找到有副作用的子节点
    const child: FiberNode | null = nextEffect.child;

    if (
      (nextEffect.subtreeFlags & MutationMask) !== NoFlags &&
      child !== null
    ) {
      nextEffect = child;
    } else {
      // [2] 没有子副作用，向上遍历
      up: while (nextEffect !== null) {
        // 执行副作用
        commitMutationEffectsOnFiber(nextEffect);

        const sibling: FiberNode | null = nextEffect.sibling;
        if (sibling !== null) {
          nextEffect = sibling;
          break up;
        }

        nextEffect = nextEffect.return;
      }
    }
  }
};
```

**遍历策略**:
- **先向下**: 找到最深的有副作用的节点
- **再向上**: 从叶子节点开始执行副作用，然后处理兄弟节点

---

#### 4.2 commitPlacement（插入 DOM）

**文件**: `packages/react-reconciler/src/commitWork.ts:47-94`

```typescript
const commitPlacement = (finishedWork: FiberNode) => {
  // [1] 找到父 DOM 节点
  const hostParent = getHostParent(finishedWork);

  if (hostParent !== null) {
    // [2] 插入到父节点
    appendPlacementNodeIntoContainer(finishedWork, hostParent);
  }
};
```

##### 4.2.1 getHostParent（查找父 DOM）

```typescript
function getHostParent(fiber: FiberNode): Container | null {
  let parent = fiber.return;

  while (parent) {
    const parentTag = parent.tag;

    // [1] 原生 DOM 节点，直接返回
    if (parentTag === HostComponent) {
      return parent.stateNode;
    }

    // [2] 根节点，返回容器
    if (parentTag === HostRoot) {
      return (parent.stateNode as FiberRootNode).container;
    }

    // [3] FunctionComponent 等，继续向上
    parent = parent.return;
  }

  return null;
}
```

**示例**:
```
<div>              ← HostComponent, parent.stateNode = <div>
  <App>            ← FunctionComponent, 跳过
    <h1>hello</h1> ← 当前节点
  </App>
</div>

getHostParent(h1) → 向上找到 div.stateNode
```

---

##### 4.2.2 appendPlacementNodeIntoContainer（递归插入）

```typescript
function appendPlacementNodeIntoContainer(
  finishedWork: FiberNode,
  hostParent: Container
) {
  // [1] 如果是原生 DOM 或文本，直接插入
  if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
    appendChildToContainer(hostParent, finishedWork.stateNode);
    return;
  }

  // [2] 非原生节点（如 FunctionComponent），插入其子节点
  const child = finishedWork.child;
  if (child !== null) {
    appendPlacementNodeIntoContainer(child, hostParent);

    // [3] 插入所有兄弟节点
    let sibling = child.sibling;
    while (sibling !== null) {
      appendPlacementNodeIntoContainer(sibling, hostParent);
      sibling = sibling.sibling;
    }
  }
}
```

**示例**:
```
div (有 Placement 标记)
  ↓ appendPlacementNodeIntoContainer(div, rootContainer)
  ↓ div 是 HostComponent → appendChildToContainer(rootContainer, div.stateNode)
  ↓ 将 <div> 插入 document.getElementById('root')
```

---

## 4. 详细函数注解

### 4.1 JSX 模块

#### jsxDEV

**路径**: `packages/react/src/jsx.ts:73-104`

**签名**: `jsxDEV(type: ElementType, config: any): ReactElementType`

**功能**: 将 JSX 转换为 ReactElement 对象

**参数**:
- `type`: 组件类型（'div' 或 FunctionComponent）
- `config`: props 对象（包含 children、key、ref 等）

**返回**: ReactElement 对象

**实现细节**:
```typescript
export const jsxDEV = (type: ElementType, config: any) => {
  let key: Key = null;
  const props: Props = {};
  let ref: Ref = null;

  // 遍历 config，分离 key/ref 和普通 props
  for (const prop in config) {
    const val = config[prop];

    if (prop === 'key') {
      if (val !== undefined) {
        key = String(val);
      }
      continue;
    }

    if (prop === 'ref') {
      if (val !== undefined) {
        ref = val;
      }
      continue;
    }

    // 只保留自身属性（非继承）
    if ({}.hasOwnProperty.call(config, prop)) {
      props[prop] = val;
    }
  }

  return ReactElement(type, key, ref, props);
};
```

**为什么用 `{}.hasOwnProperty.call(config, prop)`**:
```javascript
// 如果 config 自定义了 hasOwnProperty
const config = {
  name: 'App',
  hasOwnProperty: () => false
};

config.hasOwnProperty('name'); // false（被覆盖）
{}.hasOwnProperty.call(config, 'name'); // true（更可靠）
```

---

### 4.2 ReactDOM 模块

#### createRoot

**路径**: `packages/react-dom/src/root.ts:11-19`

**签名**: `createRoot(container: Container): { render: Function }`

**功能**: 创建 React 根容器

**实现**:
```typescript
export function createRoot(container: Container) {
  // [1] 创建 FiberRootNode 和 HostRootFiber
  const root = createContainer(container);

  // [2] 返回 render 方法
  return {
    render(element: ReactElementType) {
      updateContainer(element, root);
    }
  };
}
```

---

### 4.3 Reconciler 模块

#### createContainer

**路径**: `packages/react-reconciler/src/fiberReconciler.ts`

**功能**: 创建 Fiber 根节点

**实现**:
```typescript
export function createContainer(container: Container) {
  // [1] 创建 HostRoot 类型的 Fiber
  const hostRootFiber = new FiberNode(HostRoot, {}, null);

  // [2] 创建 FiberRootNode
  const root = new FiberRootNode(container, hostRootFiber);

  // [3] 初始化更新队列
  hostRootFiber.updateQueue = createUpdateQueue();

  return root;
}
```

**初始结构**:
```
FiberRootNode {
  container: <div id="root">
  current: HostRootFiber
}
    ↓
HostRootFiber {
  tag: HostRoot
  stateNode: FiberRootNode (指回)
  updateQueue: { shared: { pending: null } }
}
```

---

#### updateContainer

**路径**: `packages/react-reconciler/src/fiberReconciler.ts`

**功能**: 将 ReactElement 加入更新队列并触发调度

**实现**:
```typescript
export function updateContainer(
  element: ReactElementType,
  root: FiberRootNode
) {
  const hostRootFiber = root.current;

  // [1] 创建 Update 对象
  const update = createUpdate<ReactElementType>(element);

  // [2] 将 Update 加入队列
  enqueueUpdate(
    hostRootFiber.updateQueue as UpdateQueue<ReactElementType>,
    update
  );

  // [3] 触发调度
  scheduleUpdateOnFiber(hostRootFiber);

  return element;
}
```

---

#### scheduleUpdateOnFiber

**路径**: `packages/react-reconciler/src/workLoop.ts:14-18`

**功能**: 调度更新

**实现**:
```typescript
export function scheduleUpdateOnFiber(fiber: FiberNode) {
  // [1] 从当前 Fiber 向上找到 FiberRootNode
  const root = markUpdateFromFiberToRoot(fiber);

  // [2] 开始渲染
  renderRoot(root);
}
```

---

#### markUpdateFromFiberToRoot

**路径**: `packages/react-reconciler/src/workLoop.ts:20-31`

**功能**: 向上遍历找到根节点

**实现**:
```typescript
function markUpdateFromFiberToRoot(fiber: FiberNode) {
  let node = fiber;
  let parent = node.return;

  // 向上遍历直到 return 为 null
  while (parent !== null) {
    node = parent;
    parent = node.return;
  }

  // 检查是否是 HostRoot
  if (node.tag === HostRoot) {
    return node.stateNode; // 返回 FiberRootNode
  }

  return null;
}
```

---

#### createWorkInProgress

**路径**: `packages/react-reconciler/src/fiber.ts:77-103`

**功能**: 创建或复用 workInProgress Fiber（双缓存机制）

**实现**:
```typescript
export const createWorkInProgress = (
  current: FiberNode,
  pendingProps: Props
): FiberNode => {
  let wip = current.alternate;

  if (wip === null) {
    // ====== Mount 阶段 ======
    // 创建新 Fiber
    wip = new FiberNode(current.tag, pendingProps, current.key);
    wip.stateNode = current.stateNode;

    // 建立双向链接
    wip.alternate = current;
    current.alternate = wip;
  } else {
    // ====== Update 阶段 ======
    // 复用已有 Fiber
    wip.pendingProps = pendingProps;
    wip.flags = NoFlags;
    wip.subtreeFlags = NoFlags;
  }

  // 复制属性
  wip.type = current.type;
  wip.updateQueue = current.updateQueue;
  wip.child = current.child;
  wip.memoizedProps = current.memoizedProps;
  wip.memoizedState = current.memoizedState;

  return wip;
};
```

**双缓存示意**:
```
Mount:
current ←→ wip (新建)

Update:
current ←→ wip (复用)
  ↓
清空 flags 和 subtreeFlags
```

---

#### processUpdateQueue

**路径**: `packages/react-reconciler/src/updateQueue.ts`

**功能**: 处理更新队列，计算新状态

**实现**:
```typescript
export const processUpdateQueue = <State>(
  baseState: State,
  pendingUpdate: Update<State> | null
): { memoizedState: State } => {
  const result: ReturnType<typeof processUpdateQueue<State>> = {
    memoizedState: baseState
  };

  if (pendingUpdate !== null) {
    const action = pendingUpdate.action;

    if (action instanceof Function) {
      // [1] 函数形式：setState(prev => prev + 1)
      result.memoizedState = action(baseState);
    } else {
      // [2] 值形式：setState(1)
      result.memoizedState = action;
    }
  }

  return result;
};
```

---

### 4.4 HostConfig 模块（DOM 操作）

**路径**: `packages/react-dom/src/hostConfig.ts`

#### createInstance

```typescript
export function createInstance(type: string): Instance {
  const element = document.createElement(type);
  return element;
}
```

#### createTextInstance

```typescript
export function createTextInstance(content: string | number): TextInstance {
  const text = document.createTextNode(String(content));
  return text;
}
```

#### appendInitialChild

```typescript
export const appendInitialChild = (
  parent: Instance | Container,
  child: Instance
) => {
  parent.appendChild(child);
};
```

#### appendChildToContainer

```typescript
export const appendChildToContainer = appendInitialChild;
```

---

## 5. 关键算法解析

### 5.1 双缓存机制

**目的**: 避免直接操作旧 Fiber 树，提高性能

**原理**:
```
屏幕显示
    ↓
FiberRootNode
    ├─ current → Fiber 树 A（旧）
    └─ finishedWork → Fiber 树 B（新）
                        ↓
                  构建完成后交换
                        ↓
    ├─ current → Fiber 树 B（新）
    └─ finishedWork → null
```

**实现**:
1. Mount 时创建 workInProgress 树
2. Update 时复用 alternate 指向的 Fiber
3. Commit 后交换 `root.current`

---

### 5.2 Flags 收集与冒泡

**目的**: 快速定位需要执行副作用的子树

**原理**:
```
text.flags = Placement
    ↓ bubbleProperties
h1.subtreeFlags = Placement
    ↓ bubbleProperties
div.subtreeFlags = Placement
    ↓ commitRoot
if (div.subtreeFlags & MutationMask) {
  // 子树有副作用，需要遍历
  commitMutationEffects(div);
}
```

**优化**: 如果 `subtreeFlags = NoFlags`，可以跳过整个子树。

---

### 5.3 深度优先遍历

**Render 阶段**（先序 + 后序）:
```
beginWork (先序):
App → div → p → Child → h1 → text

completeWork (后序):
text → h1 → Child → p → div → App
```

**Commit 阶段**（后序）:
```
commitMutationEffects:
text → h1 → Child → p → div → App
```

---

### 5.4 Diff 算法（当前实现）

**单节点 Diff**:
```typescript
reconcileSingleElement(returnFiber, currentFiber, element)
    ↓
createFiberFromElement(element)
    ↓
判断 alternate 是否为 null
    ├─ null → 标记 Placement
    └─ 非 null → 不标记（复用）
```

**待实现**: 多节点 Diff（列表、key 匹配）

---

## 6. 调试指南

### 6.1 启动 Demo

```bash
pnpm demo
```

访问 `http://localhost:5173`

---

### 6.2 调试点设置

**关键断点**:
1. `packages/react/src/jsx.ts:73` - JSX 转换
2. `packages/react-reconciler/src/workLoop.ts:14` - 调度入口
3. `packages/react-reconciler/src/workLoop.ts:94` - 工作单元
4. `packages/react-reconciler/src/beginWork.ts:15` - Render 递阶段
5. `packages/react-reconciler/src/completeWork.ts:18` - Render 归阶段
6. `packages/react-reconciler/src/commitWork.ts:9` - Commit 阶段

---

### 6.3 打印 Fiber 树

在 `workLoop.ts:52` 添加:
```typescript
console.log('Fiber Tree:', finishedWork);
```

**输出结构**:
```
FiberNode {
  tag: 3 (HostRoot)
  child: FiberNode {
    tag: 0 (FunctionComponent)
    type: App
    child: FiberNode {
      tag: 5 (HostComponent)
      type: 'div'
      stateNode: <div>
      child: ...
    }
  }
}
```

---

### 6.4 Demo 示例分析

**代码**: `demos/test-fc/main.tsx`
```jsx
const App = () => (
  <div>
    <p><Child /></p>
  </div>
);

const Child = () => <h1>hello pk react</h1>;
```

**Fiber 树结构**:
```
HostRoot (FiberRootNode.current)
  ↓
App (FunctionComponent)
  ↓
div (HostComponent, stateNode = <div>)
  ↓
p (HostComponent, stateNode = <p>)
  ↓
Child (FunctionComponent)
  ↓
h1 (HostComponent, stateNode = <h1>)
  ↓
"hello pk react" (HostText, stateNode = TextNode)
```

**DOM 树结构**:
```html
<div id="root">
  <div>
    <p>
      <h1>hello pk react</h1>
    </p>
  </div>
</div>
```

---

## 7. 未来扩展

### 7.1 待实现功能

- [ ] Hooks (useState, useEffect, useRef 等)
- [ ] 多节点 Diff (数组子节点)
- [ ] Update 流程（状态更新）
- [ ] 事件系统（合成事件）
- [ ] 调度器（时间切片、优先级）
- [ ] Suspense 和并发特性

---

### 7.2 学习路径建议

1. **理解数据结构**: FiberNode、ReactElement、UpdateQueue
2. **跟踪执行流程**: 从 `createRoot` 到 `commitRoot`
3. **动手调试**: 在关键位置打印变量
4. **修改 Demo**: 尝试多层嵌套、多个兄弟节点
5. **实现 Hooks**: 从 `useState` 开始理解状态更新机制

---

## 8. 常见问题

### Q1: 为什么需要 workInProgress 和 current 两棵树？

**A**: 双缓存机制的优势:
1. **避免闪烁**: 在内存中构建完整 DOM 树后一次性提交
2. **支持中断**: workInProgress 可以随时丢弃，current 保持不变
3. **性能优化**: Update 时复用 Fiber 节点

---

### Q2: Mount 和 Update 有什么区别？

**A**:
| 阶段 | alternate | shouldTrackEffects | Placement 标记 |
|------|-----------|-------------------|---------------|
| Mount | null | false | 只在根节点标记 |
| Update | 非 null | true | 每个新节点都标记 |

---

### Q3: flags 和 subtreeFlags 的作用？

**A**:
- **flags**: 当前节点自身的副作用
- **subtreeFlags**: 子树的副作用汇总
- **优化**: Commit 时可快速跳过无副作用的子树

---

### Q4: 为什么 completeWork 要执行 appendAllChildren？

**A**:
1. **时机**: Render 阶段已经知道 DOM 结构
2. **性能**: 在内存中拼接 DOM 树，减少回流
3. **顺序**: 从叶子到根，保证子节点先创建

---

## 9. 总结

本项目实现了 React 核心流程的最小可运行版本，涵盖了:

1. ✅ JSX 转换为 ReactElement
2. ✅ Fiber 架构与双缓存机制
3. ✅ Render 阶段的递归遍历
4. ✅ Diff 算法（单节点）
5. ✅ Commit 阶段的 DOM 操作
6. ✅ 副作用收集与冒泡

通过阅读源码和调试，你可以深入理解:
- React 如何将 JSX 转换为真实 DOM
- Fiber 架构如何支持可中断渲染
- Diff 算法如何优化更新性能
- 双缓存如何避免直接操作旧树

**下一步**: 实现 `useState`，体验完整的响应式更新流程！🚀

---

## 附录：快速查找表

### 文件功能索引

| 文件 | 核心功能 |
|------|---------|
| `react/src/jsx.ts` | JSX 转 ReactElement |
| `react-dom/src/root.ts` | createRoot API |
| `react-dom/src/hostConfig.ts` | DOM 操作封装 |
| `react-reconciler/src/fiber.ts` | Fiber 数据结构 |
| `react-reconciler/src/workLoop.ts` | 工作循环调度 |
| `react-reconciler/src/beginWork.ts` | Render 递阶段 |
| `react-reconciler/src/completeWork.ts` | Render 归阶段 |
| `react-reconciler/src/childFibers.ts` | Diff 算法 |
| `react-reconciler/src/commitWork.ts` | Commit 阶段 |
| `react-reconciler/src/updateQueue.ts` | 更新队列 |

### 函数调用链速查

```
用户代码
  ↓
jsxDEV → ReactElement
  ↓
createRoot → createContainer
  ↓
render → updateContainer
  ↓
scheduleUpdateOnFiber → renderRoot
  ↓
prepareFreshStack → createWorkInProgress
  ↓
workLoop → performUnitOfWork
  ├─ beginWork
  │   ├─ updateHostRoot → processUpdateQueue
  │   ├─ updateFunctionComponent → renderWithHooks
  │   ├─ updateHostComponent
  │   └─ reconcileChildren → reconcileChildFibers
  └─ completeUnitWork → completeWork
      ├─ createInstance / createTextInstance
      ├─ appendAllChildren
      └─ bubbleProperties
  ↓
commitRoot → commitMutationEffects
  ↓
commitPlacement → appendChildToContainer
  ↓
完成渲染
```

---

**Happy Coding! 🎉**
