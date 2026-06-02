'use client';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { mapColumnToDb, mapResult } from './mappers';

const supabase = createClient();

// Query building shims
export const query = (collectionRef: any, ...queryConstraints: any[]) => {
    const path = collectionRef ? (typeof collectionRef === 'string' ? collectionRef : collectionRef.path || collectionRef) : null;
    const existingConstraints = collectionRef?.constraints || [];
    return {
        path,
        constraints: [...existingConstraints, ...queryConstraints].filter(Boolean),
    };
};
export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc') => ({ type: 'orderBy', field, direction });
export const where = (field: string, op: string, value: any) => ({ type: 'where', field, op, value });
export const limit = (n: number) => ({ type: 'limit', value: n });

export function useCollection<T>(queryObj: any) {
    const [data, setData] = useState<T[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [refetchTrigger, setRefetchTrigger] = useState(0);

    // Extract table name safely from string or constraints object
    const tableName = queryObj ? (typeof queryObj === 'string' ? queryObj : queryObj.path || null) : null;
    const constraintsObj = queryObj?.constraints || [];

    // Stable stringified representation for useEffect dependency array
    const constraintsString = JSON.stringify(constraintsObj);

    const refetch = () => setRefetchTrigger(prev => prev + 1);

    useEffect(() => {
        if (!tableName || typeof tableName !== 'string') {
            setData(null);
            setIsLoading(false);
            return;
        }

        let isMounted = true;
        const channelName = `${tableName}-${Math.random().toString(36).slice(2)}`;

        const fetchData = async () => {
            try {
                setIsLoading(true);
                let builder = supabase.from(tableName).select('*').limit(10000);

                const constraints = JSON.parse(constraintsString);
                
                for (const c of constraints) {
                    if (!c) continue;
                    if (c.type === 'limit') {
                        builder = builder.limit(c.value);
                    } else if (c.type === 'orderBy') {
                        const dbCol = mapColumnToDb(tableName, c.field);
                        builder = builder.order(dbCol, { ascending: c.direction === 'asc' });
                    } else if (c.type === 'where') {
                        const dbCol = mapColumnToDb(tableName, c.field);
                        if (c.op === '==') {
                            builder = builder.eq(dbCol, c.value);
                        } else if (c.op === '!=') {
                            builder = builder.neq(dbCol, c.value);
                        } else if (c.op === '<') {
                            builder = builder.lt(dbCol, c.value);
                        } else if (c.op === '<=') {
                            builder = builder.lte(dbCol, c.value);
                        } else if (c.op === '>') {
                            builder = builder.gt(dbCol, c.value);
                        } else if (c.op === '>=') {
                            builder = builder.gte(dbCol, c.value);
                        } else if (c.op === 'in') {
                            builder = builder.in(dbCol, Array.isArray(c.value) ? c.value : [c.value]);
                        }
                    }
                }

                const { data: result, error: err } = await builder;
                
                if (isMounted) {
                    if (err) throw err;
                    setData(mapResult(tableName, result) as any);
                    setError(null);
                }
            } catch (err: any) {
                if (err.code === '42P01') {
                    // Suppress relation does not exist error to avoid dev overlay
                    console.warn(`Table ${tableName} does not exist yet.`);
                    if (isMounted) {
                        setData([]); // Empty state for missing tables
                        setError(err);
                    }
                } else {
                    console.warn(`Error fetching collection ${tableName}:`, err);
                    if (isMounted) setError(err);
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchData();

        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => {
                if (isMounted) fetchData();
            })
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [tableName, constraintsString, refetchTrigger]);

    return { data, isLoading, error, refetch };
}

export function useDoc<T>(queryPath: any) {
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fullPath = typeof queryPath === 'string' ? queryPath : queryPath?.path || queryPath;

    useEffect(() => {
        if (!fullPath || typeof fullPath !== 'string' || !fullPath.includes('/')) {
            setData(null);
            setIsLoading(false);
            return;
        }

        const [table, id] = fullPath.split('/');
        let isMounted = true;

        const fetch = async () => {
            try {
                setIsLoading(true);
                const { data: result, error: err } = await supabase
                    .from(table)
                    .select('*')
                    .eq('id', id)
                    .single();
                
                if (isMounted) {
                    if (err) throw err;
                    setData(mapResult(table, result) as any);
                    setError(null);
                }
            } catch (err: any) {
                if (err.code === '42P01') {
                    console.warn(`Table ${table} does not exist yet.`);
                } else {
                    console.warn(`Error fetching doc ${fullPath}:`, err);
                }
                if (isMounted) setError(err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetch();

        return () => {
            isMounted = false;
        };
    }, [fullPath]);

    return { data, isLoading, error };
}
