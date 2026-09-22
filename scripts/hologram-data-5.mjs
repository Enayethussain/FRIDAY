/**
 * Hologram data, part 5: UNAVAILABLE entries (honest gaps, no files).
 * These are high-value requests with no verified free source in-project.
 * U(category, id, displayName, aliases, reason)
 */
export function U(cat, id, name, aliases, reason) {
  return {
    id, name, display_name: name, category: cat, subcategory: 'unavailable',
    filename: '', path: '', aliases, description: reason,
    format: 'glb', animation: false,
    license: 'N/A (not bundled)', approx: false, status: 'UNAVAILABLE',
  };
}

export const PART5 = [
  U('misc', 'unav_ironman_exact', 'Iron Man Armor (exact)', ['iron man suit', 'iron man armor', 'tony stark suit'], 'No verified free exact model in-project.'),
  U('architecture', 'unav_tajmahal', 'Taj Mahal (exact)', ['taj mahal', 'tajmahal'], 'No verified free exact model in-project.'),
  U('architecture', 'unav_eiffel', 'Eiffel Tower (exact)', ['eiffel tower', 'eiffel'], 'No verified free exact model in-project.'),
  U('technology', 'unav_iphone', 'iPhone (exact)', ['iphone', 'apple iphone'], 'Trademarked product; no verified free exact model in-project.'),
  U('vehicles', 'unav_tesla', 'Tesla Car (exact)', ['tesla', 'tesla car'], 'Trademarked product; no verified free exact model in-project.'),
  U('anatomy', 'unav_brain_exact', 'Human Brain (exact anatomy)', ['exact brain', 'real brain', 'asli brain'], 'No verified free anatomically-exact model in-project.'),
  U('anatomy', 'unav_heart_exact', 'Human Heart (exact anatomy)', ['exact heart', 'real heart', 'asli dil'], 'No verified free anatomically-exact model in-project.'),
  U('nature', 'unav_trex', 'T-Rex (exact)', ['t-rex', 'trex', 'dinosaur'], 'No verified free exact model in-project.'),
  U('architecture', 'unav_burj', 'Burj Khalifa (exact)', ['burj khalifa', 'burj'], 'No verified free exact model in-project.'),
  U('vehicles', 'unav_titanic', 'Titanic Ship (exact)', ['titanic'], 'No verified free exact model in-project.'),
];
