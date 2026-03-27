import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Project, SavedSite } from '../../types';
import { useUsers, type UserRecord } from '../../hooks/useUsers';

interface Props {
  projects: Project[];
  sites: SavedSite[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  onCreateSite: (projectId: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onUpdateMembers: (projectId: string, memberIds: string[]) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile?: boolean;
  isAdmin?: boolean;
}

function MemberManager({
  project,
  users,
  onUpdateMembers,
}: {
  project: Project;
  users: UserRecord[];
  onUpdateMembers: (projectId: string, memberIds: string[]) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);

  const members = users.filter((u) => project.memberIds?.includes(u.id));
  const nonMembers = users.filter((u) => !project.memberIds?.includes(u.id));

  const addMember = (uid: string) => {
    onUpdateMembers(project.id, [...(project.memberIds ?? []), uid]);
    setShowDropdown(false);
  };

  const removeMember = (uid: string) => {
    onUpdateMembers(project.id, (project.memberIds ?? []).filter((id) => id !== uid));
  };

  return (
    <div className="px-3 pb-2 pt-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] mb-1.5">
        Members
      </div>

      {/* Member chips */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {members.length === 0 && (
          <span className="text-[10px] text-[#7A756E] italic">No members assigned</span>
        )}
        {members.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 bg-[#ED202B]/10 text-[#201F1E] text-[10px] font-medium rounded-full px-2 py-0.5"
          >
            {m.email.split('@')[0]}
            <button
              onClick={() => removeMember(m.id)}
              className="text-[#7A756E] hover:text-[#ED202B] transition"
              title={`Remove ${m.email}`}
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      {/* Add member */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="text-[10px] text-[#7A756E] hover:text-[#ED202B] transition flex items-center gap-0.5"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add member
        </button>

        <AnimatePresence>
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
              className="absolute left-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-[#D8D5D0] z-50 max-h-32 overflow-y-auto"
            >
              {nonMembers.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-[#7A756E]">All users assigned</div>
              ) : (
                nonMembers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addMember(u.id)}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-[#201F1E] hover:bg-[#ED202B]/5 transition flex items-center justify-between"
                  >
                    <span className="truncate">{u.email}</span>
                    <span className="text-[9px] text-[#7A756E] ml-2 flex-shrink-0">{u.role}</span>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function ProjectSidebar({
  projects,
  sites,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onCreateSite,
  onDeleteProject,
  onRenameProject,
  onUpdateMembers,
  collapsed,
  onToggleCollapse,
  isMobile,
  isAdmin,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedMembers, setExpandedMembers] = useState<string | null>(null);

  const { users } = useUsers();

  const sitesForProject = (projectId: string) =>
    sites.filter((s) => s.inputs.projectId === projectId);

  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    onCreateProject(name);
    setNewProjectName('');
    setShowNewProject(false);
  };

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      onDeleteProject(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  // Desktop collapsed state — just a thin expand strip
  if (collapsed && !isMobile) {
    return (
      <button
        onClick={onToggleCollapse}
        className="hidden md:flex flex-shrink-0 w-8 items-start justify-center pt-4 opacity-40 hover:opacity-100 transition"
        title="Expand sidebar"
      >
        <svg className="w-4 h-4 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  const sidebarContent = (
    <div className={`flex flex-col h-full ${isMobile ? 'w-72' : 'w-60'}`}>
      {/* Header — Projects + New + Collapse */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#7A756E] flex-1">
          Projects
        </h3>

        {/* New project inline form or + button (admin only) */}
        {isAdmin && !showNewProject && (
          <button
            onClick={() => setShowNewProject(true)}
            className="p-1 rounded-md hover:bg-[#D8D5D0]/50 transition"
            title="New project"
          >
            <svg className="w-3.5 h-3.5 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}

        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md hover:bg-[#D8D5D0]/50 transition"
            title="Collapse sidebar"
          >
            <svg className="w-3.5 h-3.5 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {isMobile && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md hover:bg-[#D8D5D0]/50 transition"
            title="Close"
          >
            <svg className="w-4 h-4 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Inline new project form (admin only) */}
      <AnimatePresence>
        {isAdmin && showNewProject && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden px-4 pb-2"
          >
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onBlur={() => {
                  if (!newProjectName.trim()) {
                    setShowNewProject(false);
                    setNewProjectName('');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProject();
                  if (e.key === 'Escape') {
                    setShowNewProject(false);
                    setNewProjectName('');
                  }
                }}
                placeholder="Project name..."
                autoFocus
                className="flex-1 rounded-md border border-[#D8D5D0] bg-white px-2.5 py-1.5 text-sm text-[#201F1E] placeholder:text-[#7A756E] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
              />
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="rounded-md bg-white text-[#ED202B] border border-[#ED202B] hover:bg-[#ED202B] hover:text-white px-3 py-1.5 text-xs font-medium transition disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto pt-1 pb-4">
        {projects.map((project) => {
          const projectSites = sitesForProject(project.id);
          const isActiveProject = project.id === activeProjectId;
          const isMembersExpanded = expandedMembers === project.id;

          return (
            <div key={project.id} className="mb-0.5">
              {/* Project row */}
              <div
                className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer rounded-lg mx-2 transition-all ${
                  isActiveProject
                    ? 'bg-white/60 shadow-sm'
                    : 'hover:bg-white/40'
                }`}
              >
                {renamingProjectId === project.id ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const trimmed = renameValue.trim();
                        if (trimmed && trimmed !== project.name) onRenameProject(project.id, trimmed);
                        setRenamingProjectId(null);
                      }
                      if (e.key === 'Escape') setRenamingProjectId(null);
                    }}
                    onBlur={() => {
                      const trimmed = renameValue.trim();
                      if (trimmed && trimmed !== project.name) onRenameProject(project.id, trimmed);
                      setRenamingProjectId(null);
                    }}
                    autoFocus
                    className="flex-1 text-[13px] font-medium text-[#201F1E] bg-white rounded px-1.5 py-0.5 border border-[#D8D5D0] outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
                  />
                ) : (
                  <button
                    onClick={() => {
                      onSelectProject(project.id);
                      if (isMobile) onToggleCollapse();
                    }}
                    className="flex-1 text-left text-[13px] font-medium text-[#201F1E] truncate"
                    title={project.name}
                  >
                    {project.name}
                  </button>
                )}

                <span className="text-[10px] text-[#7A756E] flex-shrink-0 tabular-nums">
                  {projectSites.length}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-0.5">
                  {isAdmin && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateSite(project.id);
                        }}
                        className="p-0.5 rounded hover:bg-[#D8D5D0]/60 transition"
                        title="Add site"
                      >
                        <svg className="w-3 h-3 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedMembers(isMembersExpanded ? null : project.id);
                        }}
                        className={`p-0.5 rounded transition ${
                          isMembersExpanded
                            ? 'text-[#ED202B] bg-[#ED202B]/10'
                            : 'hover:bg-[#D8D5D0]/60 text-[#7A756E]'
                        }`}
                        title="Manage members"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameValue(project.name);
                          setRenamingProjectId(project.id);
                        }}
                        className="p-0.5 rounded hover:bg-[#D8D5D0]/60 transition text-[#7A756E]"
                        title="Rename project"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(project.id);
                        }}
                        className={`p-0.5 rounded transition ${
                          confirmDelete === project.id
                            ? 'text-[#ED202B]'
                            : 'hover:bg-[#D8D5D0]/60 text-[#7A756E]'
                        }`}
                        title={confirmDelete === project.id ? 'Click again to confirm' : 'Delete project'}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Member management panel (admin only) */}
              <AnimatePresence>
                {isAdmin && isMembersExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden mx-2"
                  >
                    <MemberManager
                      project={project}
                      users={users}
                      onUpdateMembers={onUpdateMembers}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Mobile: overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onToggleCollapse}
        />
        {/* Slide-in panel */}
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="fixed inset-y-0 left-0 z-50 bg-[#FAFAF9] shadow-xl"
        >
          {sidebarContent}
        </motion.div>
      </>
    );
  }

  // Desktop: inline
  return (
    <div className="hidden md:flex flex-shrink-0">
      {sidebarContent}
    </div>
  );
}
