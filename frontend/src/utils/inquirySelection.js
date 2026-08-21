export const emptyInquirySelection = () => ({ allFiltered: false, ids: new Set(), excludedIds: new Set(), total: 0 });

export const inquiryIsSelected = (selection, id) => selection.allFiltered
  ? !selection.excludedIds.has(id)
  : selection.ids.has(id);

export const inquirySelectionCount = (selection) => selection.allFiltered
  ? Math.max(0, selection.total - selection.excludedIds.size)
  : selection.ids.size;

export const toggleInquirySelection = (selection, id) => {
  if (selection.allFiltered) {
    const excludedIds = new Set(selection.excludedIds);
    if (excludedIds.has(id)) excludedIds.delete(id); else excludedIds.add(id);
    return { ...selection, excludedIds };
  }
  const ids = new Set(selection.ids);
  if (ids.has(id)) ids.delete(id); else ids.add(id);
  return { ...selection, ids };
};

export const selectInquiryPage = (selection, pageIds) => {
  if (selection.allFiltered) {
    const excludedIds = new Set(selection.excludedIds);
    pageIds.forEach((id) => excludedIds.delete(id));
    return { ...selection, excludedIds };
  }
  const ids = new Set(selection.ids);
  pageIds.forEach((id) => ids.add(id));
  return { ...selection, ids };
};

export const deselectInquiryPage = (selection, pageIds) => {
  if (selection.allFiltered) {
    const excludedIds = new Set(selection.excludedIds);
    pageIds.forEach((id) => excludedIds.add(id));
    return { ...selection, excludedIds };
  }
  const ids = new Set(selection.ids);
  pageIds.forEach((id) => ids.delete(id));
  return { ...selection, ids };
};

export const selectAllFilteredInquiries = (total) => ({
  allFiltered: true,
  ids: new Set(),
  excludedIds: new Set(),
  total: Math.max(0, Number(total) || 0),
});

export const inquirySelectionRequest = (selection, filters) => selection.allFiltered
  ? { filtered: true, filters, excludedIds: [...selection.excludedIds] }
  : { filtered: false, ids: [...selection.ids] };
