import { Key, Props, Ref } from 'shared/ReactTypes';

import { Flags, NoFlags } from './fiberFlags';
import { WorkTag } from './workTags';

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	alternate: FiberNode | null;
	flags: Flags;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例
		this.tag = tag;
		this.key = key;
		// HostCompent <div> div DOM
		this.stateNode = null;
		// Fiber Node 的类型，比如一个 FunctionComponent 本身
		this.type = null;

		// 构成树状结构
		// 指向父 fiberNode
		this.return = null;
		// 指向第一个子 fiberNode
		this.sibling = null;
		// 指向子 child
		this.child = null;
		// 指向多个 child 时数组的下标
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		// 刚开始准备工作时的 props
		this.pendingProps = pendingProps;
		// 工作完成确定的 props
		this.memoizedProps = null;

		// 备用节点，指向另一颗 fiber 树，形成双缓存机制
		this.alternate = null;
		// 副作用
		this.flags = NoFlags;
	}
}
