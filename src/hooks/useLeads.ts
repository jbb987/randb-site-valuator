import { useState, useCallback, useEffect } from 'react';
import type { Lead, LeadStatus, LeadNote } from '../types';
import { useAuth } from './useAuth';
import {
  saveLead,
  updateLeadStatus as updateStatusInDB,
  updateLeadFields as updateFieldsInDB,
  addLeadNote as addNoteInDB,
  deleteLead as deleteLeadFromDB,
  subscribeLeads,
} from '../lib/leads';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuth();

  useEffect(() => {
    const unsub = subscribeLeads(
      (remoteLeads) => {
        setLeads(remoteLeads);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  // Employees only see their assigned leads; admins see all
  const visibleLeads = role === 'admin'
    ? leads
    : leads.filter((l) => l.assignedTo === user?.uid);

  const createLead = useCallback(
    async (data: Omit<Lead, 'id' | 'notes' | 'createdAt' | 'updatedAt'>) => {
      const id = generateId();
      const lead: Lead = {
        ...data,
        id,
        notes: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveLead(lead);
      return id;
    },
    [],
  );

  const createLeadsBulk = useCallback(
    async (items: Omit<Lead, 'id' | 'notes' | 'createdAt' | 'updatedAt'>[]) => {
      const promises = items.map((data) => {
        const id = generateId();
        const lead: Lead = {
          ...data,
          id,
          notes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return saveLead(lead);
      });
      await Promise.all(promises);
    },
    [],
  );

  const updateStatus = useCallback(
    async (id: string, status: LeadStatus) => {
      await updateStatusInDB(id, status);
    },
    [],
  );

  const updateLead = useCallback(
    async (id: string, fields: Partial<Lead>) => {
      await updateFieldsInDB(id, fields);
    },
    [],
  );

  const addNote = useCallback(
    async (leadId: string, text: string, authorId: string, authorName: string) => {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) return;
      const note: LeadNote = {
        id: generateId(),
        text,
        authorId,
        authorName,
        createdAt: Date.now(),
      };
      await addNoteInDB(leadId, [...lead.notes, note]);
    },
    [leads],
  );

  const removeLead = useCallback(
    async (id: string) => {
      await deleteLeadFromDB(id);
    },
    [],
  );

  return {
    leads: visibleLeads,
    loading,
    createLead,
    createLeadsBulk,
    updateStatus,
    updateLead,
    addNote,
    removeLead,
  };
}
