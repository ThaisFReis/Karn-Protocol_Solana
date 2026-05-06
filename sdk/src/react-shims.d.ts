declare module "react" {
  export type ReactNode = any;
  export type DependencyList = readonly unknown[];

  export function createElement(type: any, props?: any, ...children: any[]): any;
  export function createContext<T = any>(defaultValue: T): any;
  export function useContext<T = any>(context: any): T;
  export function useEffect(effect: () => void | (() => void | undefined) | Promise<void>, deps?: DependencyList): void;
  export function useMemo<T>(factory: () => T, deps?: DependencyList): T;
  export function useState<T>(initialState: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
}
