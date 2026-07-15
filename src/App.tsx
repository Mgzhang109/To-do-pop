import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type TaskStatus = 'todo' | 'doing' | 'done'
type TaskKind = 'task' | 'project'

type Task = {
  id: string
  title: string
  description: string
  status: TaskStatus
  kind: TaskKind
  category: string
  color: string
  urgency: number
  importance: number
  size: number
  parentId?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  archivedAt?: string
}

type Explosion = {
  id: string
  x: number
  y: number
  color: string
}

const STORAGE_KEY = 'to-do-pop.tasks.v1'

const palette = ['#1f9d8a', '#e15361', '#e0a22d', '#4c6fdc', '#9356c8', '#d96528']

const statusLabels: Record<TaskStatus, string> = {
  todo: '待办 TO DO',
  doing: '工作中 DOING',
  done: '已完成 DONE',
}

const quadrantLabels = [
  {
    title: '重要且紧急',
    subtitle: 'Do now',
    className: 'quadrant-now',
  },
  {
    title: '重要不紧急',
    subtitle: 'Schedule',
    className: 'quadrant-plan',
  },
  {
    title: '不重要但紧急',
    subtitle: 'Delegate',
    className: 'quadrant-delegate',
  },
  {
    title: '不重要不紧急',
    subtitle: 'Someday',
    className: 'quadrant-someday',
  },
]

const seedTasks: Task[] = [
  {
    id: 'project-launch',
    title: '上线待办气泡小软件',
    description: '大项目示例：拆成多个小气泡，逐个完成。',
    status: 'doing',
    kind: 'project',
    category: '产品',
    color: '#4c6fdc',
    urgency: 72,
    importance: 86,
    size: 88,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sub-ui',
    title: '设计四象限界面',
    description: '完成坐标轴、象限和气泡视觉。',
    status: 'doing',
    kind: 'task',
    category: '产品',
    color: '#4c6fdc',
    urgency: 78,
    importance: 88,
    size: 34,
    parentId: 'project-launch',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sub-pop',
    title: '加入爆炸动画',
    description: '点击完成时粒子飞溅并播放音效。',
    status: 'todo',
    kind: 'task',
    category: '动效',
    color: '#e15361',
    urgency: 58,
    importance: 74,
    size: 30,
    parentId: 'project-launch',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-invoice',
    title: '整理本周发票',
    description: '归到个人事务。',
    status: 'todo',
    kind: 'task',
    category: '生活',
    color: '#1f9d8a',
    urgency: 88,
    importance: 42,
    size: 42,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-reading',
    title: '读完动效设计笔记',
    description: '不急，但有助于打磨体验。',
    status: 'todo',
    kind: 'task',
    category: '学习',
    color: '#9356c8',
    urgency: 28,
    importance: 68,
    size: 46,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

const defaultDraft = {
  title: '',
  description: '',
  category: '工作',
  status: 'todo' as TaskStatus,
  kind: 'task' as TaskKind,
  urgency: 55,
  importance: 60,
  size: 48,
  color: palette[0],
  parentId: '',
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedTasks
    const parsed = JSON.parse(raw) as Task[]
    return Array.isArray(parsed) ? parsed : seedTasks
  } catch {
    return seedTasks
  }
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function playPopSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  const audio = new AudioContextClass()
  const duration = 0.18
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  const filter = audio.createBiquadFilter()

  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(520, audio.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(130, audio.currentTime + duration)
  filter.type = 'highpass'
  filter.frequency.value = 180
  gain.gain.setValueAtTime(0.001, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.018)
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration)

  oscillator.connect(filter)
  filter.connect(gain)
  gain.connect(audio.destination)
  oscillator.start()
  oscillator.stop(audio.currentTime + duration)
}

function App() {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null)
  const suppressClickRef = useRef<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>(loadTasks)
  const [draft, setDraft] = useState(defaultDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [explosions, setExplosions] = useState<Explosion[]>([])

  const visibleBubbles = useMemo(
    () => tasks.filter((task) => task.status !== 'done' && !task.parentId),
    [tasks],
  )
  const projectOptions = useMemo(
    () => tasks.filter((task) => task.kind === 'project' && task.status !== 'done'),
    [tasks],
  )
  const childMap = useMemo(() => {
    return tasks.reduce<Record<string, Task[]>>((map, task) => {
      if (!task.parentId) return map
      map[task.parentId] = [...(map[task.parentId] ?? []), task]
      return map
    }, {})
  }, [tasks])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  function resetDraft() {
    setDraft(defaultDraft)
    setEditingId(null)
  }

  function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) return

    const now = new Date().toISOString()
    if (editingId) {
      setTasks((current) =>
        current.map((task) =>
          task.id === editingId
            ? {
                ...task,
                title,
                description: draft.description.trim(),
                category: draft.category.trim() || '未分类',
                status: draft.status,
                kind: draft.kind,
                color: draft.color,
                urgency: Number(draft.urgency),
                importance: Number(draft.importance),
                size: Number(draft.size),
                parentId: draft.kind === 'project' ? undefined : draft.parentId || undefined,
                updatedAt: now,
                completedAt: draft.status === 'done' ? task.completedAt ?? now : undefined,
                archivedAt: draft.status === 'done' ? task.archivedAt ?? now : undefined,
              }
            : task,
        ),
      )
    } else {
      setTasks((current) => [
        ...current,
        {
          id: createId(),
          title,
          description: draft.description.trim(),
          status: draft.status,
          kind: draft.kind,
          category: draft.category.trim() || '未分类',
          color: draft.color,
          urgency: Number(draft.urgency),
          importance: Number(draft.importance),
          size: Number(draft.size),
          parentId: draft.kind === 'project' ? undefined : draft.parentId || undefined,
          createdAt: now,
          updatedAt: now,
          completedAt: draft.status === 'done' ? now : undefined,
          archivedAt: draft.status === 'done' ? now : undefined,
        },
      ])
    }
    resetDraft()
  }

  function editTask(task: Task) {
    setEditingId(task.id)
    setDraft({
      title: task.title,
      description: task.description,
      category: task.category,
      status: task.status,
      kind: task.kind,
      urgency: task.urgency,
      importance: task.importance,
      size: task.size,
      color: task.color,
      parentId: task.parentId ?? '',
    })
  }

  function updateTask(id: string, patch: Partial<Task>) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task,
      ),
    )
  }

  function deleteTask(id: string) {
    setTasks((current) => current.filter((task) => task.id !== id && task.parentId !== id))
    if (editingId === id) resetDraft()
  }

  function completeTask(task: Task, origin?: { x: number; y: number }) {
    const children = childMap[task.id] ?? []
    const now = new Date().toISOString()
    const x = origin?.x ?? window.innerWidth / 2
    const y = origin?.y ?? window.innerHeight / 2
    const explosionId = createId()

    setExplosions((current) => [...current, { id: explosionId, x, y, color: task.color }])
    window.setTimeout(() => {
      setExplosions((current) => current.filter((explosion) => explosion.id !== explosionId))
    }, 780)
    playPopSound()

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id || item.parentId === task.id
          ? {
              ...item,
              status: 'done',
              completedAt: now,
              archivedAt: now,
              updatedAt: now,
            }
          : item,
      ),
    )

    if (children.length) {
      window.setTimeout(() => {
        setExplosions((current) => [
          ...current,
          ...children.slice(0, 4).map((child, index) => ({
            id: createId(),
            x: x + (index - 1.5) * 38,
            y: y + (index % 2 ? 28 : -28),
            color: child.color,
          })),
        ])
      }, 80)
    }
  }

  function restoreTask(task: Task, status: TaskStatus = 'todo') {
    updateTask(task.id, {
      status,
      completedAt: undefined,
      archivedAt: undefined,
    })
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragRef.current
    if (!dragState || !boardRef.current) return
    const rect = boardRef.current.getBoundingClientRect()
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100)
    const y = clamp(100 - ((event.clientY - rect.top) / rect.height) * 100)
    dragState.moved = true
    updateTask(dragState.id, { urgency: Math.round(x), importance: Math.round(y) })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragRef.current
    if (dragState?.moved) {
      suppressClickRef.current = dragState.id
      window.setTimeout(() => {
        if (suppressClickRef.current === dragState.id) suppressClickRef.current = null
      }, 80)
    }
    dragRef.current = null
    void event
  }

  function beginDrag(event: React.PointerEvent<HTMLButtonElement>, task: Task) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: task.id, moved: false }
  }

  function finishBubbleClick(event: React.MouseEvent<HTMLButtonElement>, task: Task) {
    if (suppressClickRef.current === task.id) return
    const rect = event.currentTarget.getBoundingClientRect()
    completeTask(task, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  const groupedTasks = useMemo(
    () =>
      (['todo', 'doing', 'done'] as TaskStatus[]).map((status) => ({
        status,
        tasks: tasks.filter((task) => task.status === status),
      })),
    [tasks],
  )
  const completedTasks = tasks.filter((task) => task.status === 'done')

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">To-Do Pop</p>
          <h1>To-Do Pop</h1>
        </div>
        <div className="stats">
          <span>{tasks.filter((task) => task.status !== 'done').length} active</span>
          <span>{completedTasks.length} done</span>
        </div>
      </section>

      <section className="workspace">
        <div className="board-panel">
          <div className="axis-label axis-x">紧急程度 Urgency</div>
          <div className="axis-label axis-y">重要程度 Importance</div>
          <div
            ref={boardRef}
            className="matrix-board"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {quadrantLabels.map((quadrant) => (
              <div className={`quadrant ${quadrant.className}`} key={quadrant.title}>
                <strong>{quadrant.title}</strong>
                <span>{quadrant.subtitle}</span>
              </div>
            ))}
            <div className="axis-line vertical" />
            <div className="axis-line horizontal" />

            {visibleBubbles.map((task) => {
              const children = childMap[task.id] ?? []
              const doneChildren = children.filter((child) => child.status === 'done').length
              const bubbleSize = task.kind === 'project' ? Math.max(task.size, 78) : task.size
              return (
                <div
                  className={`bubble-wrap ${task.kind === 'project' ? 'project-wrap' : ''}`}
                  key={task.id}
                  style={{
                    left: `${task.urgency}%`,
                    bottom: `${task.importance}%`,
                    width: bubbleSize,
                    height: bubbleSize,
                  }}
                >
                  <button
                    className="bubble"
                    type="button"
                    onClick={(event) => finishBubbleClick(event, task)}
                    onPointerDown={(event) => beginDrag(event, task)}
                    style={
                      {
                        '--bubble-color': task.color,
                        '--bubble-size': `${bubbleSize}px`,
                      } as React.CSSProperties
                    }
                    title="拖动改变坐标，点击完成并爆破"
                  >
                    <span className="bubble-title">{task.title}</span>
                    <span className="bubble-meta">{task.status.toUpperCase()}</span>
                    {task.kind === 'project' && (
                      <span className="child-cloud" aria-label="project subtasks">
                        {children.slice(0, 6).map((child) => (
                          <i
                            key={child.id}
                            style={
                              {
                                '--child-color': child.color,
                              } as React.CSSProperties
                            }
                            className={child.status === 'done' ? 'child-done' : ''}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                  <button className="bubble-edit" type="button" onClick={() => editTask(task)}>
                    编辑
                  </button>
                  {task.kind === 'project' && (
                    <span className="project-progress">
                      {doneChildren}/{children.length}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <aside className="control-panel">
          <form className="task-form" onSubmit={saveTask}>
            <h2>{editingId ? '编辑气泡' : '新建气泡'}</h2>
            <label>
              标题
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="写下一个待办事项"
              />
            </label>
            <label>
              说明
              <textarea
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="补充细节、验收标准或备注"
              />
            </label>
            <div className="field-grid">
              <label>
                类型
                <select
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft({ ...draft, kind: event.target.value as TaskKind, parentId: '' })
                  }
                >
                  <option value="task">小任务</option>
                  <option value="project">大项目</option>
                </select>
              </label>
              <label>
                状态
                <select
                  value={draft.status}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}
                >
                  <option value="todo">TO DO</option>
                  <option value="doing">DOING</option>
                  <option value="done">DONE</option>
                </select>
              </label>
            </div>
            {draft.kind === 'task' && (
              <label>
                所属大项目
                <select
                  value={draft.parentId}
                  onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
                >
                  <option value="">无</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="field-grid">
              <label>
                分类
                <input
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                />
              </label>
              <label>
                颜色
                <select
                  value={draft.color}
                  onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                >
                  {palette.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              紧急 {draft.urgency}
              <input
                type="range"
                min="0"
                max="100"
                value={draft.urgency}
                onChange={(event) => setDraft({ ...draft, urgency: Number(event.target.value) })}
              />
            </label>
            <label>
              重要 {draft.importance}
              <input
                type="range"
                min="0"
                max="100"
                value={draft.importance}
                onChange={(event) => setDraft({ ...draft, importance: Number(event.target.value) })}
              />
            </label>
            <label>
              气泡大小 {draft.size}
              <input
                type="range"
                min="32"
                max="110"
                value={draft.size}
                onChange={(event) => setDraft({ ...draft, size: Number(event.target.value) })}
              />
            </label>
            <div className="form-actions">
              <button type="submit">{editingId ? '保存修改' : '加入象限'}</button>
              <button type="button" className="secondary" onClick={resetDraft}>
                清空
              </button>
            </div>
          </form>
        </aside>
      </section>

      <section className="table-section">
        <div className="section-heading">
          <h2>自动清单表格</h2>
          <p>同一份任务数据，按 TO DO / DOING / DONE 自动分类。</p>
        </div>
        <div className="status-columns">
          {groupedTasks.map((group) => (
            <article className="status-column" key={group.status}>
              <h3>{statusLabels[group.status]}</h3>
              <div className="task-list">
                {group.tasks.length === 0 && <p className="empty">暂无任务</p>}
                {group.tasks.map((task) => (
                  <div className="task-row" key={task.id}>
                    <span className="row-dot" style={{ background: task.color }} />
                    <div>
                      <strong>{task.title}</strong>
                      <small>
                        {task.kind === 'project' ? '大项目' : '小任务'} · {task.category} · U
                        {task.urgency}/I{task.importance}
                      </small>
                    </div>
                    <div className="row-actions">
                      <button type="button" onClick={() => editTask(task)}>
                        编辑
                      </button>
                      {task.status !== 'done' ? (
                        <button type="button" onClick={() => completeTask(task)}>
                          完成
                        </button>
                      ) : (
                        <button type="button" onClick={() => restoreTask(task)}>
                          恢复
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="done-archive">
        <div className="section-heading">
          <h2>已完成DONE</h2>
          <p>完成后的气泡自动收纳在这里，可编辑、删除或恢复。</p>
        </div>
        <div className="archive-list">
          {completedTasks.length === 0 && <p className="empty">还没有爆破完成的任务。</p>}
          {completedTasks.map((task) => (
            <article className="archive-card" key={task.id}>
              <span style={{ background: task.color }} />
              <div>
                <strong>{task.title}</strong>
                <small>
                  {task.completedAt
                    ? new Intl.DateTimeFormat('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(task.completedAt))
                    : '已完成'}
                </small>
              </div>
              <button type="button" onClick={() => editTask(task)}>
                编辑
              </button>
              <button type="button" onClick={() => restoreTask(task, 'doing')}>
                恢复
              </button>
              <button type="button" className="danger" onClick={() => deleteTask(task.id)}>
                删除
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="explosion-layer" aria-hidden="true">
        {explosions.map((explosion) => (
          <div
            className="explosion"
            key={explosion.id}
            style={
              {
                left: explosion.x,
                top: explosion.y,
                '--pop-color': explosion.color,
              } as React.CSSProperties
            }
          >
            {Array.from({ length: 18 }).map((_, index) => (
              <i
                key={index}
                style={
                  {
                    '--angle': `${index * 20}deg`,
                    '--distance': `${42 + (index % 5) * 11}px`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>
    </main>
  )
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

export default App
