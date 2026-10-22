import { analyzeRepository } from './analyze.js';

const files = {
  'package.json': '{ "name": "lantern", "source": "src/main.tsx", "type": "module" }',
  'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
  'src/main.tsx': `import { createRoot } from 'react-dom/client';
import { App } from './App';

// The application starts here.
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
`,
  'src/App.tsx': `import { Dashboard } from './pages/Dashboard';
import { Sidebar } from './components/Sidebar';

export function App() {
  return (
    <div className="workspace">
      <Sidebar />
      <main><Dashboard /></main>
    </div>
  );
}
`,
  'src/pages/Dashboard.tsx': `import { TaskList } from '@/components/TaskList';
import { useTasks } from '@/hooks/useTasks';

export function Dashboard() {
  const { tasks, loading, complete } = useTasks();
  return (
    <section>
      <h1>A little more focus.</h1>
      {loading ? <p>Loading tasks...</p> :
        <TaskList tasks={tasks} onComplete={complete} />}
    </section>
  );
}
`,
  'src/components/Sidebar.tsx': `import { formatDate } from '@/lib/format';

export function Sidebar() {
  return (
    <aside>
      <h2>Lantern</h2>
      <p>{formatDate(new Date())}</p>
      <a href="#today">My tasks</a>
    </aside>
  );
}
`,
  'src/components/TaskList.tsx': `import { TaskCard } from './TaskCard';
import type { Task } from '@/types/task';

export function TaskList({ tasks, onComplete }: {
  tasks: Task[];
  onComplete: (id: string) => void;
}) {
  return <div className="tasks">{tasks.map(task =>
    <TaskCard key={task.id} task={task} onComplete={onComplete} />
  )}</div>;
}
`,
  'src/components/TaskCard.tsx': `import { formatDate } from '@/lib/format';
import type { Task } from '@/types/task';

export function TaskCard({ task, onComplete }: {
  task: Task;
  onComplete: (id: string) => void;
}) {
  return (
    <article>
      <h3>{task.title}</h3>
      <time>{formatDate(task.due)}</time>
      <button onClick={() => onComplete(task.id)}>Done</button>
    </article>
  );
}
`,
  'src/hooks/useTasks.ts': `import { useEffect, useState } from 'react';
import { getTasks, completeTask } from '@/lib/api';
import type { Task } from '@/types/task';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getTasks().then(setTasks).finally(() => setLoading(false));
  }, []);
  async function complete(id: string) {
    await completeTask(id);
    setTasks(current => current.filter(task => task.id !== id));
  }
  return { tasks, loading, complete };
}
`,
  'src/lib/api.ts': `import type { Task } from '@/types/task';

export async function getTasks(): Promise<Task[]> {
  const response = await fetch('/api/tasks');
  if (!response.ok) throw new Error('Could not load tasks');
  return response.json();
}

export async function completeTask(id: string): Promise<void> {
  const response = await fetch('/api/tasks/' + encodeURIComponent(id), {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Could not complete task');
}
`,
  'src/lib/format.ts': `export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
`,
  'src/types/task.ts': `export interface Task {
  id: string;
  title: string;
  due: string;
  completed: boolean;
}
`,
};

export const demo = analyzeRepository(files, {
  owner: 'demo',
  name: 'lantern',
  fullName: 'demo/lantern',
  description: 'A small React task manager. Follow a task from the screen to the API.',
  defaultBranch: 'main',
  commit: 'sample',
  url: '',
  stars: 0,
  isDemo: true,
});
