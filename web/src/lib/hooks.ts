import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { can, type Action } from "@bmserv/shared/permissions";
import { get } from "./api";
import { qk, registerKeys } from "./queryKeys";
import type { Me } from "./types";

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => get<Me>("/me"), staleTime: 60_000, retry: false });
}

export function useCan(action: Action): boolean {
  const me = useMe();
  return can(me.data?.user.role, action);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** A mutation that refreshes the register lists (and any extra keys) afterwards. */
export function useSave<TInput, TOut>(fn: (input: TInput) => Promise<TOut>, extraKeys: QueryKey[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([...registerKeys, ...extraKeys].map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
  });
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · BMServ` : "BMServ";
  }, [title]);
}
