import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';

interface Toast {
  id: number;
  message: string;
  icon: IconName;
  leaving: boolean;
}

type Show = (message: string, icon?: IconName) => void;

const ToastContext = createContext<Show>(() => {});

const SHOWN_FOR = 2600;
const LEAVE_FOR = 200;

/**
 * Short confirmations ("Link copied", "List filtered to Region VII"), so an action
 * that changes something out of view still shows that it worked.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const show = useCallback<Show>((message, icon = 'check') => {
    const id = next.current++;
    // One message at a time: a new one replaces any still showing.
    setToasts([{ id, message, icon, leaving: false }]);
    setTimeout(() => {
      setToasts((all) =>
        all.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
      );
    }, SHOWN_FOR);
    setTimeout(
      () => setToasts((all) => all.filter((toast) => toast.id !== id)),
      SHOWN_FOR + LEAVE_FOR,
    );
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <p key={toast.id} className={`toast ${toast.leaving ? 'is-leaving' : ''}`}>
            <Icon name={toast.icon} size={18} />
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
