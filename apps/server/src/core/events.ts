import type { NotificationType, TaskStatus } from '@pph/shared';

/** Danh sách event domain. Handler chạy đồng bộ trong cùng transaction với nơi phát. */
export type DomainEvents = {
  'task.completed': { taskId: string; goalId: string | null; completionId: string };
  'task.undone': { taskId: string; goalId: string | null; completionId: string };
  'task.cancelled': { taskId: string; goalId: string | null; wasMissed: boolean; reasonTagId: string | null; deadline: string | null };
  'task.deleted': { taskId: string; goalId: string | null };
  'task.deadline_changed': { taskId: string; before: string | null; after: string | null };
  'task.reason_changed': { taskId: string; before: string | null; after: string | null };
  'task.status_changed': { taskId: string; from: TaskStatus | null; to: TaskStatus };
  'task.links_changed': { taskId: string; goalId: string | null };
  'goal.contribution_changed': { goalId: string; before: number; after: number };
  'goal.target_changed': { goalId: string; before: number; after: number };
  'goal.status_changed': { goalId: string; from: string; to: string };
  'milestone.completed': { milestoneId: string; goalId: string };
  'milestone.reopened': { milestoneId: string; goalId: string };
  'xp.transaction_created': {
    transactionId: string; type: string; lifetimeDelta: number; spendableDelta: number;
    levelBefore: number; levelAfter: number;
  };
  'settings.changed': { key: string; before: unknown; after: unknown };
  'notification.created': {
    id: string; type: NotificationType; objectType: string | null; objectId: string | null; title: string; body: string | null;
  };
};

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void;

export class EventBus {
  private handlers = new Map<keyof DomainEvents, Handler<any>[]>();

  on<K extends keyof DomainEvents>(event: K, handler: Handler<K>): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    for (const h of this.handlers.get(event) ?? []) h(payload);
  }
}
