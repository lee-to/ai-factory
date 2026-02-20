---
name: react-patterns
description: React development patterns and best practices. Covers hooks, state management, component design, and performance optimization.
argument-hint: "[topic: hooks|state|components|performance]"
---

# React Patterns Guide

Modern React patterns and best practices for building scalable applications.

## Topics

### Hooks (`/react-patterns hooks`)

**Custom Hook Pattern:**
```typescript
function useAsync<T>(asyncFn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({ data: null, loading: true, error: null });

  useEffect(() => {
    setState(prev => ({ ...prev, loading: true }));
    asyncFn()
      .then(data => setState({ data, loading: false, error: null }))
      .catch(error => setState({ data: null, loading: false, error }));
  }, deps);

  return state;
}
```

**Common Custom Hooks:**
- `useLocalStorage` - Persist state to localStorage
- `useDebounce` - Debounce rapidly changing values
- `useMediaQuery` - Responsive breakpoints
- `usePrevious` - Access previous value
- `useOnClickOutside` - Detect outside clicks

### State Management (`/react-patterns state`)

**Context + Reducer Pattern:**
```typescript
// 1. Define types
type State = { count: number };
type Action = { type: 'increment' } | { type: 'decrement' };

// 2. Create context
const StateContext = createContext<State | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

// 3. Provider component
function StateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { count: 0 });
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

// 4. Custom hooks for access
function useAppState() {
  const context = useContext(StateContext);
  if (!context) throw new Error('Must be inside StateProvider');
  return context;
}
```

**When to use what:**
- **useState**: Local component state
- **useReducer**: Complex state logic
- **Context**: Shared state (auth, theme)
- **Zustand/Jotai**: Global state, simpler than Redux
- **TanStack Query**: Server state

### Components (`/react-patterns components`)

**Composition Pattern:**
```typescript
// Instead of prop drilling, use composition
function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

Card.Header = function CardHeader({ children }) {
  return <div className="card-header">{children}</div>;
};

Card.Body = function CardBody({ children }) {
  return <div className="card-body">{children}</div>;
};

// Usage
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
</Card>
```

**Render Props Pattern:**
```typescript
function MouseTracker({ render }: { render: (pos: Position) => ReactNode }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  // ... mouse tracking logic
  return render(position);
}

// Usage
<MouseTracker render={({ x, y }) => <div>Mouse: {x}, {y}</div>} />
```

### Performance (`/react-patterns performance`)

**Memoization:**
```typescript
// Memoize expensive computations
const expensiveResult = useMemo(() => {
  return heavyComputation(data);
}, [data]);

// Memoize callbacks passed to children
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);

// Memoize components that receive same props
const MemoizedChild = memo(function Child({ data }) {
  return <div>{data}</div>;
});
```

**Code Splitting:**
```typescript
// Lazy load components
const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <HeavyComponent />
    </Suspense>
  );
}
```

**Virtualization:**
```typescript
// For long lists, use virtualization
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });
  // ... render only visible items
}
```

## Best Practices

1. **Single Responsibility** - One component, one job
2. **Lift state up** - Share state via common ancestor
3. **Colocation** - Keep related code together
4. **Avoid prop drilling** - Use composition or context
5. **Type everything** - Use TypeScript for safety
6. **Test behavior** - Not implementation details

## Anti-Patterns to Avoid

- Mutating state directly
- useEffect for derived state
- Inline object/array props (causes re-renders)
- Over-using context for frequently changing state
- Giant components (break them down)
