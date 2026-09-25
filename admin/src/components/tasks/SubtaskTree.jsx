import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Collapse, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { AddCircleOutline, ChevronRight, ExpandMore, SubdirectoryArrowRight } from '@mui/icons-material';
import { formatDate } from '../../services/tasks';
import { PriorityChip, ProgressBar, StatusChip } from './TaskChips';

function Node({ node, level, onAddChild, canAdd, maxDepth }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(level < 2);
  const hasChildren = node.children?.length > 0;
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: level * 2.5, py: 0.8, borderBottom: '1px solid #f1f5f9', '&:hover': { bgcolor: '#f8fafb' } }}>
        <IconButton size="small" onClick={() => setOpen(!open)} sx={{ visibility: hasChildren ? 'visible' : 'hidden' }}>{open ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}</IconButton>
        <SubdirectoryArrowRight fontSize="small" sx={{ color: 'text.disabled' }} />
        <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(`/tasks/${node._id}`)}>
          <Typography variant="body2" fontWeight={600} noWrap sx={{ textDecoration: node.status === 'CANCELLED' ? 'line-through' : 'none' }}>{node.taskKey} · {node.title}</Typography>
          <Typography variant="caption" color="text.secondary">{node.assignee?.name || node.owner?.name || 'Unassigned'}{node.deadline ? ` · due ${formatDate(node.deadline)}` : ''}</Typography>
        </Box>
        {hasChildren && <ProgressBar progress={node.progress} />}
        <PriorityChip priority={node.priority} />
        <StatusChip status={node.status} />
        {canAdd && node.depth < maxDepth && <Tooltip title="Add nested subtask"><IconButton size="small" onClick={() => onAddChild(node)}><AddCircleOutline fontSize="small" /></IconButton></Tooltip>}
      </Stack>
      {hasChildren && <Collapse in={open}>{node.children.map((child) => <Node key={child._id} node={child} level={level + 1} onAddChild={onAddChild} canAdd={canAdd} maxDepth={maxDepth} />)}</Collapse>}
    </Box>
  );
}

export default function SubtaskTree({ nodes = [], onAddChild, canAdd, maxDepth = 10 }) {
  if (!nodes.length) return <Typography variant="body2" color="text.secondary">No subtasks yet.</Typography>;
  return <Box>{nodes.map((node) => <Node key={node._id} node={node} level={0} onAddChild={onAddChild} canAdd={canAdd} maxDepth={maxDepth} />)}</Box>;
}
