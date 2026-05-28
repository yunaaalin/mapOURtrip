/* =============================================
   app.js — Seoul Eats SPA v4
   Flow: Home → Gu View → Dong View → Modal
   ============================================= */
'use strict';

// ============================================================
// Constants
// ============================================================
const GEOJSON_URL      = './seoul_municipalities.json';
const DONG_GEOJSON_URL = './seoul_submunicipalities.json';

const SEOUL_BOUNDS = { minLng: 126.764, maxLng: 127.183, minLat: 37.428, maxLat: 37.701 };

const DONG_KR_TO_CN = {
  '연남동':          '延南洞',
  '종로1·2·3·4가동': '廣藏市場一帶',
  '성수1가2동':      '聖水洞',
  '성수1가1동':      '聖水洞（北）',
  '성수2가3동':      '聖水洞（南）',
  '성산1동':         '聖山洞（望遠）',
  '성산2동':         '聖山洞',
  '서교동':          '西橋洞（弘大）',
  '망원2동':         '望遠洞',
  '명동':            '明洞',
  '원효로1동':       '元曉路洞',
  '삼청동':          '三清洞',
  '잠원동':          '蠶院洞',
  '사직동':          '社稷洞',
  '종로5·6가동':     '鐘路五六街',
  '화곡6동':         '花谷洞',
  '안암동':          '安岩洞',
  '신당동':          '新堂洞',
  '중림동':          '中林洞',
  '가양1동':         '加陽洞',
  '광희동':          '光熙洞',
  '수유2동':         '水踰洞',
  '서초4동':         '瑞草洞',
  '신사동':          '新沙洞（江南）',
  '가회동':          '嘉會洞',
  '등촌2동':         '登村洞',
  '역삼1동':         '驛三洞',
  '연희동':          '延禧洞',
  '한강로동':        '漢江路洞',
  '황학동':          '黃鶴洞',
};

const GU_KR_TO_CN = {
  '마포구': '麻浦區', '종로구': '鐘路區', '중구': '中區',
  '용산구': '龍山區', '강남구': '江南區', '성동구': '城東區',
  '동대문구': '東大門區', '서대문구': '西大門區', '서초구': '瑞草區',
  '영등포구': '永登浦區', '은평구': '恩平區', '노원구': '蘆原區',
  '성북구': '城北區', '광진구': '廣津區', '강서구': '江西區',
  '강북구': '江北區',
};

// ============================================================
// State & Storage
// ============================================================
const MUST_EAT_KEY = 'seoul_must_eat';
let mustEatIds = [];

const S = {
  geoData:   null,
  dongData:  null,
  guToDongs: {},
  dongToGu:  {},
  view:      'loading',
  gu:        null,   // current gu name (for back nav from dong view)
  dong:      null,
  openDong:  null,
  fromModal: null,
};

function loadMustEat() {
  const saved = localStorage.getItem(MUST_EAT_KEY);
  if (saved) {
    try {
      mustEatIds = JSON.parse(saved);
    } catch (e) {
      mustEatIds = [];
    }
  }
}

function saveMustEat() {
  localStorage.setItem(MUST_EAT_KEY, JSON.stringify(mustEatIds));
}

function isMustEat(id) {
  return mustEatIds.includes(id);
}

function toggleMustEat(id) {
  const idx = mustEatIds.indexOf(id);
  if (idx === -1) {
    mustEatIds.push(id);
    showToast('已加入「我必須吃到！」清單 🐽🍴');
  } else {
    mustEatIds.splice(idx, 1);
    showToast('已移出「我必須吃到！」清單');
  }
  saveMustEat();
  
  if (S.fromModal && S.fromModal.restaurantId === id) {
    openModal(id);
  }
  
  refreshCurrentView();
}

function refreshCurrentView() {
  if (S.view === 'home') renderHome();
  else if (S.view === 'gu') gotoGu(S.gu);
  else if (S.view === 'dong') gotoDong(S.dong);
  else if (S.view === 'donglist') renderDongListView();
  else if (S.view === 'categorylist') renderCategoryListView();
  else if (S.view === 'musteatlist') renderMustEatListView();
}

// ── Lightweight Toast Notification ──
function showToast(msg) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('visible'); }, 50);
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => { el.remove(); }, 300);
  }, 2800);
}

// ── SVG Star Generator ──
function getStarPoints(cx, cy, spikes = 5, outerRadius = 9, innerRadius = 4.2) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  let step = Math.PI / spikes;
  let points = [];

  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    rot += step;
  }
  return points.join(' ');
}

// ── Reusable Pan & Zoom + Overlap Prevention ──
function setupPanZoom(svgId) {
  const svg = document.getElementById(svgId);
  if (!svg) return;

  let zoomGroup = svg.querySelector('.zoom-group');
  if (!zoomGroup) {
    zoomGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    zoomGroup.setAttribute('class', 'zoom-group');
    while (svg.firstChild) {
      zoomGroup.appendChild(svg.firstChild);
    }
    svg.appendChild(zoomGroup);
  }

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  const isHome = (svgId === 'home-svg');
  const isGu = (svgId === 'gu-svg');
  
  let sliderId = 'dist-zoom-range';
  if (isHome) sliderId = 'home-zoom-range';
  else if (isGu) sliderId = 'gu-zoom-range';

  let btnInId = 'dist-zoom-in';
  if (isHome) btnInId = 'home-zoom-in';
  else if (isGu) btnInId = 'gu-zoom-in';

  let btnOutId = 'dist-zoom-out';
  if (isHome) btnOutId = 'home-zoom-out';
  else if (isGu) btnOutId = 'gu-zoom-out';

  const slider = document.getElementById(sliderId);
  const btnIn  = document.getElementById(btnInId);
  const btnOut = document.getElementById(btnOutId);

  function updateTransform() {
    zoomGroup.setAttribute('transform', `translate(${tx}, ${ty}) scale(${scale})`);
    
    if (slider) slider.value = scale.toFixed(2);
    
    const dotCircles = zoomGroup.querySelectorAll('.dot-circle');
    const dotStars   = zoomGroup.querySelectorAll('.dot-star');
    const dotLabels  = zoomGroup.querySelectorAll('.dot-label');
    const hotelCircle = zoomGroup.querySelectorAll('.hotel-dot circle');
    const hotelText   = zoomGroup.querySelectorAll('.hotel-dot text');

    const shrinkFactor = Math.sqrt(scale);

    dotCircles.forEach(c => {
      c.setAttribute('r', (5.5 / shrinkFactor).toFixed(1));
      c.style.strokeWidth = (1.5 / shrinkFactor).toFixed(1);
    });

    dotStars.forEach(s => {
      s.style.transform = `scale(${1 / shrinkFactor})`;
      s.style.transformOrigin = 'center';
      s.style.transformBox = 'fill-box';
    });

    dotLabels.forEach(l => {
      const parent = l.parentNode;
      const targetDot = parent.querySelector('circle, polygon');
      if (targetDot) {
        const baseFs = isGu ? 9.2 : 11.5;
        l.style.fontSize = `${(baseFs / shrinkFactor).toFixed(1)}px`;
        l.style.strokeWidth = `${(2.2 / shrinkFactor).toFixed(1)}px`;
      }
    });

    if (hotelCircle.length) {
      hotelCircle[0].setAttribute('r', (8 / shrinkFactor).toFixed(1));
    }
    if (hotelText.length) {
      hotelText[0].style.fontSize = `${(11.5 / shrinkFactor).toFixed(1)}px`;
    }
    
    const guHomeLabels = zoomGroup.querySelectorAll('.gu-home-label');
    if (guHomeLabels.length) {
      guHomeLabels.forEach(l => {
        const fs = parseFloat(l.getAttribute('data-fs') || 11);
        l.style.fontSize = `${(fs / shrinkFactor).toFixed(1)}px`;
        l.style.strokeWidth = `${(2.2 / shrinkFactor).toFixed(1)}px`;
      });
    }

    const guDongLabels = zoomGroup.querySelectorAll('.gu-dong-label');
    const guDongCnt    = zoomGroup.querySelectorAll('.gu-dong-cnt');
    if (guDongLabels.length) {
      guDongLabels.forEach(l => {
        const fs = parseFloat(l.getAttribute('data-fs') || 13);
        l.style.fontSize = `${(fs / shrinkFactor).toFixed(1)}px`;
      });
      guDongCnt.forEach(c => {
        const fs = parseFloat(c.getAttribute('data-fs') || 10);
        c.style.fontSize = `${(fs / shrinkFactor).toFixed(1)}px`;
      });
    }

    resolveLabelCollisions(svgId, scale);
  }

  // Mouse wheel zoom
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const svgMouseX = (mouseX - tx) / scale;
    const svgMouseY = (mouseY - ty) / scale;

    const zoomFactor = 1.15;
    if (e.deltaY < 0) {
      scale = Math.min(scale * zoomFactor, 8);
    } else {
      scale = Math.max(scale / zoomFactor, 0.8);
    }

    tx = mouseX - svgMouseX * scale;
    ty = mouseY - svgMouseY * scale;

    updateTransform();
  }, { passive: false });

  // Slider zoom
  if (slider) {
    slider.addEventListener('input', e => {
      const targetScale = parseFloat(e.target.value);
      const rect = svg.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      
      const svgCx = (cx - tx) / scale;
      const svgCy = (cy - ty) / scale;
      
      scale = targetScale;
      tx = cx - svgCx * scale;
      ty = cy - svgCy * scale;
      
      updateTransform();
    });
  }

  // Click buttons zoom
  function triggerZoom(factor) {
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    
    const svgCx = (cx - tx) / scale;
    const svgCy = (cy - ty) / scale;
    
    scale = Math.min(Math.max(scale * factor, 0.8), 8);
    tx = cx - svgCx * scale;
    ty = cy - svgCy * scale;
    
    updateTransform();
  }

  if (btnIn) btnIn.addEventListener('click', () => triggerZoom(1.3));
  if (btnOut) btnOut.addEventListener('click', () => triggerZoom(0.75));

  // Panning (Mouse)
  svg.addEventListener('mousedown', e => {
    isPanning = true;
    startX = e.clientX - tx;
    startY = e.clientY - ty;
    svg.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    tx = e.clientX - startX;
    ty = e.clientY - startY;
    updateTransform();
  });

  window.addEventListener('mouseup', () => {
    if (!isPanning) return;
    isPanning = false;
    svg.style.cursor = 'grab';
  });

  // Touch panning support for mobile screens
  let touchStartX = 0;
  let touchStartY = 0;
  
  svg.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      isPanning = true;
      touchStartX = e.touches[0].clientX - tx;
      touchStartY = e.touches[0].clientY - ty;
    }
  }, { passive: true });

  svg.addEventListener('touchmove', e => {
    if (!isPanning || e.touches.length !== 1) return;
    tx = e.touches[0].clientX - touchStartX;
    ty = e.touches[0].clientY - touchStartY;
    updateTransform();
  }, { passive: true });

  svg.addEventListener('touchend', () => {
    isPanning = false;
  }, { passive: true });
  
  svg.style.cursor = 'grab';
  svg.style.userSelect = 'none';
  updateTransform();
}

// ── Multi-label Collision Avoidance ──
function resolveLabelCollisions(svgId, scale) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  
  const labels = svg.querySelectorAll('.rest-dot .dot-label');
  const placedBoxes = [];
  
  const labelArray = Array.from(labels);
  labelArray.sort((a, b) => {
    const aIsMust = a.parentNode.classList.contains('dot-is-must');
    const bIsMust = b.parentNode.classList.contains('dot-is-must');
    return bIsMust - aIsMust;
  });
  
  const shrinkFactor = Math.sqrt(scale);
  const isGu = (svgId === 'gu-svg');
  const baseFs = isGu ? 9.2 : 11.5;
  const fontSize = baseFs / shrinkFactor;
  
  labelArray.forEach(l => {
    const text = l.textContent;
    const parent = l.parentNode;
    const targetDot = parent.querySelector('circle, polygon');
    const leaderLine = parent.querySelector('.label-line');
    
    if (!targetDot) return;
    
    let rx = 0, ry = 0;
    if (targetDot.tagName === 'circle') {
      rx = parseFloat(targetDot.getAttribute('cx'));
      ry = parseFloat(targetDot.getAttribute('cy'));
    } else if (targetDot.tagName === 'polygon') {
      const ptsStr = targetDot.getAttribute('points') || '';
      const coords = ptsStr.split(' ').map(pair => pair.split(',').map(Number));
      const xs = coords.map(c => c[0]);
      const ys = coords.map(c => c[1]);
      rx = (Math.min(...xs) + Math.max(...xs)) / 2;
      ry = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    
    const charW = fontSize * 0.70;
    const boxW = text.length * charW;
    const boxH = fontSize * 1.3;
    
    const naturalDx = 0;
    const naturalDy = -28 / shrinkFactor;
    
    const candidates = [
      { dx: 0,   dy: -28 },
      { dx: 0,   dy: 26  },
      { dx: -45, dy: -28 },
      { dx: 45,  dy: -28 },
      { dx: -45, dy: 26  },
      { dx: 45,  dy: 26  },
      { dx: 0,   dy: -52 },
      { dx: 0,   dy: 50  },
      { dx: -65, dy: -52 },
      { dx: 65,  dy: -52 },
      { dx: -65, dy: 50  },
      { dx: 65,  dy: 50  },
      { dx: 0,   dy: -76 },
      { dx: 0,   dy: 74  },
      { dx: -85, dy: -76 },
      { dx: 85,  dy: -76 },
      { dx: -85, dy: 74  },
      { dx: 85,  dy: 74  }
    ].map(c => ({
      dx: c.dx / shrinkFactor,
      dy: c.dy / shrinkFactor
    }));
    
    let chosenDx = naturalDx;
    let chosenDy = naturalDy;
    let found = false;
    
    for (const c of candidates) {
      const labelX = rx + c.dx;
      const labelY = ry + c.dy;
      
      const box = {
        x1: labelX - boxW / 2 - 3,
        x2: labelX + boxW / 2 + 3,
        y1: labelY - boxH + 2,
        y2: labelY + 2
      };
      
      let intersect = false;
      for (const pb of placedBoxes) {
        if (!(box.x2 < pb.x1 || box.x1 > pb.x2 || box.y2 < pb.y1 || box.y1 > pb.y2)) {
          intersect = true;
          break;
        }
      }
      
      if (!intersect) {
        chosenDx = c.dx;
        chosenDy = c.dy;
        placedBoxes.push(box);
        found = true;
        break;
      }
    }
    
    if (!found) {
      chosenDx = naturalDx;
      chosenDy = naturalDy;
      placedBoxes.push({
        x1: rx + naturalDx - boxW / 2 - 3,
        x2: rx + naturalDx + boxW / 2 + 3,
        y1: ry + naturalDy - boxH + 2,
        y2: ry + naturalDy + 2
      });
    }
    
    const finalX = rx + chosenDx;
    const finalY = ry + chosenDy;
    
    l.setAttribute('x', finalX.toFixed(1));
    l.setAttribute('y', finalY.toFixed(1));
    l.style.display = '';
    
    if (leaderLine) {
      leaderLine.setAttribute('x1', rx.toFixed(1));
      leaderLine.setAttribute('y1', ry.toFixed(1));
      leaderLine.setAttribute('x2', finalX.toFixed(1));
      const lineY2 = finalY + (chosenDy < 0 ? 3 / shrinkFactor : -10 / shrinkFactor);
      leaderLine.setAttribute('y2', lineY2.toFixed(1));
      leaderLine.style.display = 'block';
      leaderLine.style.stroke = 'rgba(255, 255, 255, 0.65)';
      leaderLine.style.strokeWidth = (1.25 / shrinkFactor).toFixed(2);
    }
  });

  if (svgId === 'gu-svg') {
    const dongLabels = svg.querySelectorAll('.dong-label-group');
    const placedDongBoxes = [];
    
    dongLabels.forEach(g => {
      const line = g.querySelector('.dong-label-line');
      const textLabel = g.querySelector('.gu-dong-label');
      const textCnt = g.querySelector('.gu-dong-cnt');
      
      if (!line || !textLabel || !textCnt) return;
      
      const dcx = parseFloat(line.getAttribute('x1'));
      const dcy = parseFloat(line.getAttribute('y1'));
      const initX = parseFloat(line.getAttribute('x2'));
      const initY = parseFloat(line.getAttribute('y2'));
      
      const dcn = textLabel.textContent;
      const fs = parseFloat(textLabel.getAttribute('data-fs') || 12);
      const fontSize = fs / shrinkFactor;
      
      const boxW = dcn.length * fontSize * 0.72 + 10;
      const boxH = fontSize * 2.2;
      
      const candidates = [
        { dx: 0,   dy: 0   },
        { dx: 0,   dy: -18 },
        { dx: 0,   dy: 18  },
        { dx: -30, dy: 0   },
        { dx: 30,  dy: 0   },
        { dx: -30, dy: -18 },
        { dx: 30,  dy: -18 },
        { dx: -30, dy: 18  },
        { dx: 30,  dy: 18  },
        { dx: 0,   dy: -36 },
        { dx: 0,   dy: 36  },
        { dx: -50, dy: 0   },
        { dx: 50,  dy: 0   }
      ].map(c => ({
        dx: c.dx / shrinkFactor,
        dy: c.dy / shrinkFactor
      }));
      
      let chosenDx = 0;
      let chosenDy = 0;
      let found = false;
      
      for (const c of candidates) {
        const testX = initX + c.dx;
        const testY = initY + c.dy;
        
        const box = {
          x1: testX - boxW / 2 - 4,
          x2: testX + boxW / 2 + 4,
          y1: testY - boxH / 2 - 2,
          y2: testY + boxH / 2 + 2
        };
        
        let intersect = false;
        for (const pb of placedDongBoxes) {
          if (!(box.x2 < pb.x1 || box.x1 > pb.x2 || box.y2 < pb.y1 || box.y1 > pb.y2)) {
            intersect = true;
            break;
          }
        }
        
        if (!intersect) {
          chosenDx = c.dx;
          chosenDy = c.dy;
          placedDongBoxes.push(box);
          found = true;
          break;
        }
      }
      
      if (!found) {
        placedDongBoxes.push({
          x1: initX - boxW / 2 - 4,
          x2: initX + boxW / 2 + 4,
          y1: initY - boxH / 2 - 2,
          y2: initY + boxH / 2 + 2
        });
      }
      
      const finalX = initX + chosenDx;
      const finalY = initY + chosenDy;
      
      textLabel.setAttribute('x', finalX.toFixed(1));
      textLabel.setAttribute('y', (finalY - 2).toFixed(1));
      
      textCnt.setAttribute('x', finalX.toFixed(1));
      textCnt.setAttribute('y', (finalY + fontSize - 1).toFixed(1));
      
      line.setAttribute('x2', finalX.toFixed(1));
      line.setAttribute('y2', finalY.toFixed(1));
    });
  }
}

// ============================================================
// Projection & Aspect Ratio Utilities
// ============================================================
function getCorrectedSize(bounds, maxWidth, maxHeight, pad = 32) {
  const boundsW = bounds.maxLng - bounds.minLng;
  const boundsH = bounds.maxLat - bounds.minLat;
  const geoAspect = boundsW / boundsH;
  
  let targetW = maxWidth;
  let targetH = targetW / geoAspect;
  
  if (targetH > maxHeight) {
    targetH = maxHeight;
    targetW = targetH * geoAspect;
  }
  
  return [targetW, targetH];
}

function project(lng, lat, bounds, W, H, pad = 32) {
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (W - pad*2) + pad;
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * (H - pad*2) + pad;
  return [x, y];
}

function ringToD(ring, bounds, W, H, pad) {
  return ring.map((c, i) => {
    const [x, y] = project(c[0], c[1], bounds, W, H, pad);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + 'Z';
}

function geomToD(geom, bounds, W, H, pad = 32) {
  const toPath = (polys) => polys.map(ring => ringToD(ring, bounds, W, H, pad)).join(' ');
  if (geom.type === 'Polygon')      return toPath(geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.map(poly => toPath(poly)).join(' ');
  return '';
}

function getFeatureBounds(feat) {
  let mnLng = Infinity, mxLng = -Infinity, mnLat = Infinity, mxLat = -Infinity;
  const walk = c => {
    if (typeof c[0] === 'number') {
      if (c[0] < mnLng) mnLng = c[0]; if (c[0] > mxLng) mxLng = c[0];
      if (c[1] < mnLat) mnLat = c[1]; if (c[1] > mxLat) mxLat = c[1];
    } else c.forEach(walk);
  };
  walk(feat.geometry.coordinates);
  return { minLng: mnLng, maxLng: mxLng, minLat: mnLat, maxLat: mxLat };
}

function padBounds(b, factor = 0.22) {
  const dlng = (b.maxLng - b.minLng) * factor;
  const dlat = (b.maxLat - b.minLat) * factor;
  return { minLng: b.minLng - dlng, maxLng: b.maxLng + dlng,
           minLat: b.minLat - dlat, maxLat: b.maxLat + dlat };
}

function centroid(feat) {
  let sx = 0, sy = 0, n = 0;
  const walk = c => {
    if (typeof c[0] === 'number') { sx += c[0]; sy += c[1]; n++; }
    else c.forEach(walk);
  };
  walk(feat.geometry.coordinates);
  return [sx/n, sy/n];
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================================
// Geo helpers — dong→gu mapping
// ============================================================
function pointInRing(x, y, ring) {
  let inside = false;
  let p1x = ring[0][0], p1y = ring[0][1];
  for (let i = 1; i <= ring.length; i++) {
    const [p2x, p2y] = ring[i % ring.length];
    if (y > Math.min(p1y, p2y) && y <= Math.max(p1y, p2y) && x <= Math.max(p1x, p2x)) {
      if (p1y !== p2y) {
        const xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x;
        if (p1x === p2x || x <= xinters) inside = !inside;
      }
    }
    p1x = p2x; p1y = p2y;
  }
  return inside;
}

function pointInFeatureCheck(lng, lat, feat) {
  const geom  = feat.geometry;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    if (pointInRing(lng, lat, poly[0])) return true;
  }
  return false;
}

function buildDongGuMapping() {
  const usedDongs = [...new Set(RESTAURANTS.map(r => r.dongKR).filter(Boolean))];
  S.dongToGu  = {};
  S.guToDongs = {};
  usedDongs.forEach(dongKR => {
    const dongFeat = dongFeature(dongKR);
    if (!dongFeat) return;
    const [dlng, dlat] = centroid(dongFeat);
    for (const guFeat of S.geoData.features) {
      if (pointInFeatureCheck(dlng, dlat, guFeat)) {
        const guName = guFeat.properties.name;
        S.dongToGu[dongKR] = guName;
        if (!S.guToDongs[guName]) S.guToDongs[guName] = [];
        if (!S.guToDongs[guName].includes(dongKR)) S.guToDongs[guName].push(dongKR);
        break;
      }
    }
  });
}

// ============================================================
// Rendering helpers
// ============================================================
function catColor(catName) { return CATEGORY_COLORS[catName] || '#C8A84B'; }
function dongCN(dongKR)    { return DONG_KR_TO_CN[dongKR] || dongKR; }
function guCN(guKR)        { return GU_KR_TO_CN[guKR] || guKR; }

function dongFeature(dongKR) {
  if (!S.dongData) return null;
  return S.dongData.features.find(f => f.properties.name === dongKR);
}

function safeAttr(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// ============================================================
// Particle System
// ============================================================
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  const ctx    = canvas.getContext('2d');
  let pts      = [];
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  
  function spawn() {
    pts = Array.from({ length: 45 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2.2 + 0.8,
      vx: (Math.random() - 0.5) * 0.48,
      vy: (Math.random() - 0.5) * 0.48,
      a: Math.random() * 0.35 + 0.15,
    }));
  }

  // Draw soft-edged 4-pointed sparkle
  function drawSparkle(cx, cy, r, alpha) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.moveTo(cx, cy - r * 2.8);
    ctx.quadraticCurveTo(cx, cy, cx + r * 2.8, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy + r * 2.8);
    ctx.quadraticCurveTo(cx, cy, cx - r * 2.8, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy - r * 2.8);
    ctx.closePath();
    ctx.fill();
    
    // Soft glow center
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 1.4})`;
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cards = Array.from(document.querySelectorAll('.map-wrap svg, .cat-view, .must-eat-view, .modal-box'));
    const rects = cards.map(c => c.getBoundingClientRect());

    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;  if (p.x > canvas.width)  p.x = 0;
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
      
      let inside = false;
      for (const r of rects) {
        if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) {
          inside = true;
          break;
        }
      }
      
      if (!inside) {
        drawSparkle(p.x, p.y, p.r, p.a);
      }
    });
    requestAnimationFrame(draw);
  }
  
  resize(); spawn(); draw();
  window.addEventListener('resize', () => { resize(); spawn(); });
}

// ============================================================
// GeoJSON Loading
// ============================================================
async function loadGeo() {
  const [r1, r2] = await Promise.all([
    fetch(GEOJSON_URL), fetch(DONG_GEOJSON_URL)
  ]);
  
  if (!r1.ok) {
    throw new Error(`無法取得行政區邊界資料 (HTTP ${r1.status})，請確認該檔案是否已成功部署在伺服器根目錄。`);
  }
  if (!r2.ok) {
    throw new Error(`無法取得地區邊界資料 (HTTP ${r2.status})，請確認該檔案是否已成功部署在伺服器根目錄。`);
  }
  
  try {
    S.geoData  = await r1.json();
  } catch (e) {
    throw new Error(`行政區邊界資料格式解析錯誤：${e.message}`);
  }
  
  try {
    S.dongData = await r2.json();
  } catch (e) {
    throw new Error(`地區邊界資料格式解析錯誤：${e.message}`);
  }
  
  buildDongGuMapping();
  return true;
}

function svgSize() {
  return [Math.min(window.innerWidth * 0.86, 720), Math.min(window.innerHeight * 0.78, 620)];
}

// ============================================================
// VIEW 1 — HOME
// Flat Seoul + warm dong patches + gu name labels
// Hover gu → tooltip; Click gu → gotoGu()
// ============================================================
function renderHome() {
  hideTip();
  S.view = 'home';
  S.gu   = null;
  const app    = document.getElementById('app');
  const [maxW, maxH] = [Math.min(window.innerWidth * 0.86, 720), Math.min(window.innerHeight * 0.70, 520)];
  const [W, H] = getCorrectedSize(SEOUL_BOUNDS, maxW, maxH, 30);

  let seoulBgPaths   = '';
  let dongHighlights = '';
  let guLabels       = '';
  let guZones        = '';

  if (S.geoData && S.dongData) {
    // 1) Flat Seoul background
    S.geoData.features.forEach(f => {
      seoulBgPaths += `<path d="${geomToD(f.geometry, SEOUL_BOUNDS, W, H, 30)}"/>`;
    });

    // 2) Warm dong highlights
    const usedDongs = [...new Set(RESTAURANTS.map(r => r.dongKR).filter(Boolean))];
    usedDongs.forEach(dongKR => {
      const feat = dongFeature(dongKR);
      if (!feat) return;
      dongHighlights += `<path class="home-dong-highlight" d="${geomToD(feat.geometry, SEOUL_BOUNDS, W, H, 30)}"/>`;
    });

    // 3) Gu name labels + invisible hover/click zones
    const labelSz = Math.max(8, Math.min(12, Math.round(7200 / W)));
    Object.keys(S.guToDongs).forEach(guName => {
      const guFeat = S.geoData.features.find(f => f.properties.name === guName);
      if (!guFeat) return;
      const d = geomToD(guFeat.geometry, SEOUL_BOUNDS, W, H, 30);
      const [clng, clat] = centroid(guFeat);
      const [cx, cy]     = project(clng, clat, SEOUL_BOUNDS, W, H, 30);
      const cn = guCN(guName);

      guLabels += `
        <text class="gu-home-label" font-size="${labelSz}" data-fs="${labelSz}"
              x="${cx.toFixed(1)}" y="${cy.toFixed(1)}">${cn}</text>
      `;

      guZones += `<path class="home-gu-zone" d="${d}"
        onmouseenter="showTip(event,'進入${safeAttr(cn)}？')"
        onmouseleave="hideTip()"
        onclick="hideTip();gotoGu('${safeAttr(guName)}')"/>`;
    });
  }

  app.innerHTML = `
    <div class="view home-view">
      <div class="home-header">
        <h1>首爾豬什麼🐽🍴</h1>
        <p>點選有橙色標記的地區，進入行政區查看餐廳</p>
      </div>
      <div class="map-wrap" style="position: relative;">
        <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" id="home-svg">
          <g class="seoul-bg">${seoulBgPaths}</g>
          <g class="home-dong-layer">${dongHighlights}</g>
          <g class="home-gu-label-layer">${guLabels}</g>
          <g class="home-gu-zones">${guZones}</g>
        </svg>
        <div class="zoom-controls">
          <button class="zoom-btn" id="home-zoom-in">＋</button>
          <div class="zoom-slider-wrap">
            <input type="range" class="zoom-slider" id="home-zoom-range" min="0.8" max="8" step="0.1" value="1" orient="vertical">
          </div>
          <button class="zoom-btn" id="home-zoom-out">－</button>
        </div>
      </div>
      <div class="home-footer">
        <button class="btn-pill" onclick="renderDongListView()">⊞ 區域清單</button>
        <button class="btn-pill btn-category-list" onclick="renderCategoryListView()">⊞ 分類清單</button>
        <button class="btn-pill btn-must-eat" onclick="renderMustEatListView()">⭐ 我必須吃到！</button>
      </div>
    </div>
  `;
  setupPanZoom('home-svg');
}

// ============================================================
// VIEW 2 — GU DETAIL
// Shows gu shape with blue clickable dong blocks
// ============================================================
function gotoGu(guName) {
  hideTip();
  S.view = 'gu';
  S.gu   = guName;
  const app    = document.getElementById('app');
  const guFeat = S.geoData.features.find(f => f.properties.name === guName);
  if (!guFeat) { renderHome(); return; }

  const cn    = guCN(guName);
  const dongs = S.guToDongs[guName] || [];

  const bounds = padBounds(getFeatureBounds(guFeat), 0.16);
  const [maxW, maxH] = [Math.min(window.innerWidth * 0.9, 820), Math.min(window.innerHeight * 0.70, 560)];
  const pad    = 46;
  const [W, H] = getCorrectedSize(bounds, maxW, maxH, pad);

  const guPath  = geomToD(guFeat.geometry, bounds, W, H, pad);
  const labelSz = Math.max(10, Math.min(16, Math.round(5800 / W)));

  let dongPaths  = '';
  let dongLabels = '';

  const [guClng, guClat] = centroid(guFeat);
  const [guCx, guCy]     = project(guClng, guClat, bounds, W, H, pad);

  dongs.forEach(dongKR => {
    const feat = dongFeature(dongKR);
    if (!feat) return;
    const d = geomToD(feat.geometry, bounds, W, H, pad);
    const [clng, clat] = centroid(feat);
    const [dcx, dcy]     = project(clng, clat, bounds, W, H, pad);
    const dcn = dongCN(dongKR);
    const cnt = RESTAURANTS.filter(r => r.dongKR === dongKR).length;

    const dx = dcx - guCx;
    const dy = dcy - guCy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = len > 0 ? dx / len : 0;
    const uy = len > 0 ? dy / len : 0;

    const pushDist = 58;
    let labelX = dcx + ux * pushDist;
    let labelY = dcy + uy * pushDist;

    labelX = Math.max(30, Math.min(W - 30, labelX));
    labelY = Math.max(20, Math.min(H - 20, labelY));

    dongPaths  += `<path class="gu-dong-block" d="${d}"
      onclick="gotoDong('${safeAttr(dongKR)}')"
      onmouseenter="showTip(event,'${safeAttr(dcn)}・${cnt}間 →')"
      onmouseleave="hideTip()"/>`;

    dongLabels += `
      <g class="dong-label-group" id="dong-label-${dongKR}">
        <line class="dong-label-line" x1="${dcx.toFixed(1)}" y1="${dcy.toFixed(1)}" x2="${labelX.toFixed(1)}" y2="${labelY.toFixed(1)}" 
              stroke="rgba(160, 134, 100, 0.48)" stroke-width="0.8" stroke-dasharray="2,3" />
        <text class="gu-dong-label" font-size="${labelSz}" data-fs="${labelSz}"
              x="${labelX.toFixed(1)}" y="${(labelY - 2).toFixed(1)}">${dcn}</text>
        <text class="gu-dong-cnt"   font-size="${Math.max(7, labelSz - 3)}" data-fs="${Math.max(7, labelSz - 3)}"
              x="${labelX.toFixed(1)}" y="${(labelY + labelSz - 1).toFixed(1)}">${cnt} 間</text>
      </g>`;
  });

  // Render restaurant dots inside this Gu (shows stars for must eat!)
  const restsInGu = RESTAURANTS.filter(r => S.dongToGu[r.dongKR] === guName);
  const guDotsHTML = restsInGu.map(r => {
    const [rx, ry] = project(r.lng, r.lat, bounds, W, H, pad);
    const col = catColor(r.category);
    const isMust = isMustEat(r.id);
    const shape = isMust
      ? `<polygon class="dot-star" points="${getStarPoints(rx, ry, 5, 8.5, 3.8)}" />`
      : `<circle class="dot-circle" cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="5.5" fill="${col}"/>`;
      
    return `
      <g class="rest-dot${isMust ? ' dot-is-must' : ''}" id="dot-${r.id}" style="pointer-events: none;">
        ${shape}
      </g>`;
  }).join('');

  app.innerHTML = `
    <div class="view gu-view">
      <div class="district-header">
        <button class="btn-back" onclick="renderHome()">← 首頁</button>
        <div class="district-name-block">
          <div class="dn-cn">${cn}</div>
          <div class="dn-sub">${guName} &nbsp;·&nbsp; ${dongs.length} 個地區</div>
        </div>
      </div>
      <div class="map-wrap" style="position: relative;">
        <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" id="gu-svg">
          <path class="gu-bg-shape" d="${guPath}"/>
          <g class="gu-dong-layer">${dongPaths}</g>
          <g class="gu-dong-label-layer">${dongLabels}</g>
          <g id="gu-dots-layer">${guDotsHTML}</g>
        </svg>
        <div class="zoom-controls">
          <button class="zoom-btn" id="gu-zoom-in">＋</button>
          <div class="zoom-slider-wrap">
            <input type="range" class="zoom-slider" id="gu-zoom-range" min="0.8" max="8" step="0.1" value="1" orient="vertical">
          </div>
          <button class="zoom-btn" id="gu-zoom-out">－</button>
        </div>
      </div>
      
      <div class="gu-dongs-nav">
        <div class="gu-dongs-nav-title">地區快速瀏覽：</div>
        <div class="gu-dongs-nav-list">
          ${dongs.map(dongKR => {
            const cnt = RESTAURANTS.filter(r => r.dongKR === dongKR).length;
            return `
              <button class="btn-dong-nav" onclick="gotoDong('${safeAttr(dongKR)}')">
                <span class="btn-dong-nav-name">${dongCN(dongKR)}</span>
                <span class="btn-dong-nav-count">${cnt}間</span>
              </button>`;
          }).join('')}
        </div>
      </div>

      <div class="gu-hint">
        點藍色區塊，就能看到那裡有哪些餐廳 👆
      </div>
    </div>
  `;
  setupPanZoom('gu-svg');
}

// ============================================================
// VIEW 3 — DONG DETAIL
// Shows dong shape with restaurant dots
// Back button → gu view (if came from gu); Home button always visible
// ============================================================
function gotoDong(dongKR, highlightId = null) {
  hideTip();
  S.view = 'dong';
  S.dong = dongKR;

  const app  = document.getElementById('app');
  const feat = dongFeature(dongKR);
  if (!feat) { renderHome(); return; }

  const cn     = dongCN(dongKR);
  const bounds = padBounds(getFeatureBounds(feat), 0.38);
  const [maxW, maxH] = [Math.min(window.innerWidth * 0.9, 820), Math.min(window.innerHeight * 0.70, 560)];
  const pad    = 38;
  const [W, H] = getCorrectedSize(bounds, maxW, maxH, pad);

  const rests = RESTAURANTS
    .filter(r => r.dongKR === dongKR)
    .sort((a, b) => haversine(HOTEL.lat, HOTEL.lng, a.lat, a.lng) - haversine(HOTEL.lat, HOTEL.lng, b.lat, b.lng));

  const distPath = geomToD(feat.geometry, bounds, W, H, pad);

  // Hotel marker
  const [hx, hy] = project(HOTEL.lng, HOTEL.lat, bounds, W, H, pad);
  const hotelDotHTML = (hx > 0 && hx < W && hy > 0 && hy < H) ? `
    <g class="hotel-dot">
      <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="8"/>
      <text x="${hx.toFixed(1)}" y="${(hy-13).toFixed(1)}">飯店</text>
    </g>` : '';

  const dotHTML = rests.map(r => {
    const [rx, ry] = project(r.lng, r.lat, bounds, W, H, pad);
    const col  = catColor(r.category);
    const isHL = highlightId === r.id;
    const isMust = isMustEat(r.id);
    
    const shape = isMust 
      ? `<polygon class="dot-star" points="${getStarPoints(rx, ry, 5, 10, 4.5)}" />`
      : `<circle class="dot-circle" cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="7" fill="${col}"/>`;

    return `
      <g class="rest-dot${isHL ? ' dot-hl' : ''}${isMust ? ' dot-is-must' : ''}" id="dot-${r.id}"
         onclick="openModal('${r.id}')"
         onmouseenter="showTip(event,'${safeAttr(r.nameCN)}')"
         onmouseleave="hideTip()">
        <line class="label-line" x1="${rx.toFixed(1)}" y1="${ry.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${(ry-12).toFixed(1)}" stroke="rgba(255,255,255,0.4)" stroke-width="0.8" style="display:none;"/>
        ${shape}
        <text class="dot-label" x="${rx.toFixed(1)}" y="${(ry-12).toFixed(1)}">${r.nameCN}</text>
      </g>`;
  }).join('');

  // Back button: go to gu view if we know which gu we came from
  const backLabel = S.gu ? `← ${guCN(S.gu)}` : '← 首頁';
  const backClick = S.gu ? `gotoGu('${safeAttr(S.gu)}')` : 'renderHome()';

  app.innerHTML = `
    <div class="view district-view">
      <div class="district-header">
        <button class="btn-back" onclick="${backClick}">${backLabel}</button>
        <div class="district-name-block">
          <div class="dn-cn">${cn}</div>
          <div class="dn-sub">${feat.properties.name_eng} &nbsp;·&nbsp; ${rests.length} 間餐廳</div>
        </div>
      </div>
      <div class="map-wrap" style="position: relative;">
        <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" id="dist-svg">
          <path class="dist-bg-shape" d="${distPath}"/>
          ${hotelDotHTML}
          <g id="dots-layer">${dotHTML}</g>
        </svg>
        <div class="zoom-controls">
          <button class="zoom-btn" id="dist-zoom-in">＋</button>
          <div class="zoom-slider-wrap">
            <input type="range" class="zoom-slider" id="dist-zoom-range" min="0.8" max="8" step="0.1" value="1" orient="vertical">
          </div>
          <button class="zoom-btn" id="dist-zoom-out">－</button>
        </div>
      </div>
      <div class="dong-footer">
        <button class="btn-home-footer" onclick="renderHome()">回首頁</button>
      </div>
    </div>
  `;
  setupPanZoom('dist-svg');

  if (highlightId) setTimeout(() => blinkDot(highlightId), 200);
}

function blinkDot(restaurantId) {
  const dotG = document.getElementById(`dot-${restaurantId}`);
  if (!dotG) return;
  const target = dotG.querySelector('.dot-circle') || dotG.querySelector('.dot-star');
  if (!target) return;
  
  target.classList.add('dot-highlight-pulse');
  
  setTimeout(() => {
    target.classList.remove('dot-highlight-pulse');
  }, 2000);
}

// ============================================================
// TOOLTIP
// ============================================================
function showTip(e, text) {
  const t = document.getElementById('tooltip');
  if (!t) return;
  t.textContent = text;
  t.style.left = e.clientX + 'px';
  t.style.top  = (e.clientY - 36) + 'px';
  t.classList.add('visible');
}
function hideTip() {
  const t = document.getElementById('tooltip');
  if (t) t.classList.remove('visible');
}

// ============================================================
// MODAL & Card Rendering & BOOKMARKS (我必須吃到！)
// Shows: rating, IG Reels, featured dish, address, walking distance
// ============================================================

function ratingColor(val) {
  const v = parseFloat(val);
  if (v >= 4.5) return '#3d9e5c';
  if (v >= 4.0) return '#B8942A';
  if (v >= 3.5) return '#C07030';
  return '#B04040';
}

function walkingMinutes(r) {
  const km = haversine(HOTEL.lat, HOTEL.lng, r.lat, r.lng);
  const min = Math.round(km / 4.5 * 60);
  return min <= 3 ? '步行 3 分鐘內' : `步行約 ${min} 分鐘`;
}

// ── Shared Card Template Generator ──
function createRestaurantCardHTML(r, isFeedView = false) {
  const col      = catColor(r.category);
  const dispName = r.nameCN || r.nameKR || '---';

  // ── Rating + IG Reels row ──
  const rc = ratingColor(r.googleRating);
  const ratingBlock = r.googleRating ? `
    <div class="m-rating-row">
      <span class="m-star">★</span>
      <span class="m-rating-num" style="color:${rc}">${r.googleRating}</span>
      ${r.googleReviews ? `<span class="m-review-cnt">${r.googleReviews}則評論</span>` : ''}
      ${r.IGreels
        ? `<a class="btn-ig" href="${r.IGreels}" target="_blank" rel="noopener">📱 IG Reels</a>`
        : ''}
    </div>` : '';

  // ── Clickable category badge ──
  const catBadge = `<span class="m-cat-tag m-cat-clickable"
    style="background:${col}"
    onclick="openCategoryList('${safeAttr(r.category)}')">${r.category}</span>`;

  // ── Clickable hashtag badges ──
  const hashBadges = r.hashtags.map(h =>
    `<span class="m-hash m-hash-clickable"
      onclick="openTagList('${safeAttr(h)}')">#${h}</span>`
  ).join('');

  // ── Info rows ──
  const featDish = r.featuredDish && r.featuredDish.trim()
    ? `<div class="m-info-row">
        <span class="m-info-icon">🍽</span>
        <div class="m-info-content">
          <div class="m-info-label">推薦菜色</div>
          <div class="m-info-val">${r.featuredDish}</div>
        </div>
      </div>` : '';

  const locRow = `
    <div class="m-info-row">
      <span class="m-info-icon">🏙</span>
      <div class="m-info-content">
        <div class="m-info-label">地區</div>
        <div class="m-info-val">${dongCN(r.dongKR)}<span class="m-kr-small"> ${r.dongKR}</span></div>
      </div>
    </div>`;

  const addrRow = r.addressEN
    ? `<div class="m-info-row">
        <span class="m-info-icon">📍</span>
        <div class="m-info-content">
          <div class="m-info-label">地址</div>
          <div class="m-info-val m-addr">${r.addressEN}</div>
        </div>
      </div>` : '';

  const walkRow = `
    <div class="m-info-row">
      <span class="m-info-icon">🚶</span>
      <div class="m-info-content">
        <div class="m-info-label">距飯店距離</div>
        <div class="m-info-val">${walkingMinutes(r)}</div>
      </div>
    </div>`;

  // ── Action buttons ──
  const naverBtn = r.naverUrl
    ? `<a class="btn-ext-link btn-naver" href="${r.naverUrl}" target="_blank" rel="noopener">
        <span>🗺</span> Naver 地圖</a>`
    : `<a class="btn-ext-link btn-naver"
        href="https://map.naver.com/v5/search/${encodeURIComponent(dispName)}"
        target="_blank" rel="noopener">🔍 Naver 搜尋</a>`;

  const googleBtn = r.googleUrl
    ? `<a class="btn-ext-link" href="${r.googleUrl}" target="_blank" rel="noopener">
        <span>🌐</span> Google Maps</a>`
    : '';

  // Must eat status & button
  const isME = isMustEat(r.id);
  const mustEatBtn = `
    <button class="btn-must-eat-card-toggle${isME ? ' is-active' : ''}" onclick="toggleMustEat('${r.id}')">
      ${isME ? '★ 已在清單' : '☆ 必須吃到！'}
    </button>
  `;

  // Return to Map button
  const mapReturnBtn = isFeedView
    ? `<button class="btn-map-return" onclick="returnToMapFromFeed('${r.id}','${safeAttr(r.dongKR)}')">← 在地圖查看</button>`
    : `<button class="btn-map-return" onclick="returnToMap('${r.id}','${safeAttr(r.dongKR)}')">← 回到地圖</button>`;

  return `
    <div class="restaurant-rich-card" data-id="${r.id}">
      <div class="m-card-header">
        <div class="m-card-header-titles">
          <div class="m-name-cn">${dispName}</div>
          <div class="m-name-kr">${r.nameKR || '<span class="m-placeholder">韓文名稱待補</span>'}</div>
        </div>
        ${mustEatBtn}
      </div>

      <div class="m-tags-row">
        ${catBadge}
        ${hashBadges}
      </div>

      ${ratingBlock}

      <div class="m-divider"></div>

      <div class="m-info-section">
        ${featDish}
        ${locRow}
        ${walkRow}
        ${addrRow}
      </div>

      <div class="m-divider"></div>

      <div class="m-actions">
        ${mapReturnBtn}
        ${naverBtn}
        ${googleBtn}
      </div>
    </div>
  `;
}

function openModal(restId) {
  hideTip();
  const r = RESTAURANTS.find(x => x.id === restId);
  if (!r) return;
  S.fromModal = { restaurantId: restId };

  document.getElementById('modal-body').innerHTML = createRestaurantCardHTML(r, false);
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  S.fromModal = null;
}

function returnToMap(restId, dongKR) {
  closeModal();
  gotoDong(dongKR, restId);
}

function returnToMapFromFeed(restId, dongKR) {
  const guName = S.dongToGu[dongKR];
  if (guName) S.gu = guName;
  gotoDong(dongKR, restId);
}

// ── 「我必須吃到！」清單頁面 ──
function renderMustEatListView() {
  hideTip();
  S.view = 'musteatlist';
  S.openDong = null;
  S.gu = null;

  const app = document.getElementById('app');
  const mustEatRests = RESTAURANTS.filter(r => isMustEat(r.id));

  const cardsHTML = mustEatRests.map(r => createRestaurantCardHTML(r, true)).join('');

  const emptyHTML = `
    <div class="list-empty">
      <div style="font-size: 38px; margin-bottom: 12px;">🐽🍴</div>
      <div>目前還沒有加入任何餐廳唷！</div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">點開地圖餐廳的詳細資訊，點選「☆ 必須吃到！」即可加入</div>
    </div>
  `;

  const headerHTML = `
    <div class="must-eat-header">
      <button class="btn-back" onclick="renderHome()">← 首頁</button>
      <span class="must-eat-header-title">🐽 我必須吃到！</span>
      <span class="must-eat-header-sub">${mustEatRests.length} 間</span>
      ${mustEatRests.length > 0 
        ? `<button class="btn-share-list" onclick="shareMustEatList()">🔗 分享清單</button>`
        : ''
      }
    </div>
  `;

  app.innerHTML = `
    <div class="view must-eat-view">
      ${headerHTML}
      <div class="must-eat-body">
        ${mustEatRests.length === 0 ? emptyHTML : `<div class="must-eat-cards-feed">${cardsHTML}</div>`}
      </div>
    </div>
  `;
}

// ── 旅伴分享網址產生 ──
function shareMustEatList() {
  if (mustEatIds.length === 0) {
    showToast('目前清單是空的，先加入幾間餐廳吧！');
    return;
  }
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}#share=${mustEatIds.join(',')}`;
  
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('已複製分享網址！傳給旅伴即可合併清單 🐽🍴');
  }).catch(err => {
    console.error('Copy failed:', err);
    showToast('複製失敗，請手動複製網址');
  });
}

// ── 旅伴分享網址監聽與合併 ──
function checkAndImportSharedList() {
  const hash = window.location.hash;
  if (hash.startsWith('#share=')) {
    const idsStr = hash.substring(7);
    if (idsStr) {
      const ids = idsStr.split(',').filter(id => {
        return RESTAURANTS.some(r => r.id === id);
      });
      if (ids.length > 0) {
        loadMustEat();
        let addedCount = 0;
        ids.forEach(id => {
          if (!mustEatIds.includes(id)) {
            mustEatIds.push(id);
            addedCount++;
          }
        });
        if (addedCount > 0) {
          saveMustEat();
          showToast(`已成功合併旅伴的清單！新增了 ${addedCount} 間必吃餐廳 🐽🍴`);
        } else {
          showToast('您已擁有旅伴分享的所有必吃餐廳！👌');
        }
        setTimeout(() => {
          renderMustEatListView();
        }, 300);
      }
    }
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
  }
}

// ── 「分類清單」頁面 ──
function renderCategoryListView() {
  hideTip();
  S.view = 'categorylist';
  S.openDong = null;
  S.gu = null;

  const app = document.getElementById('app');

  const cats = [...new Set(RESTAURANTS.map(r => r.category).filter(Boolean))];

  const sectionsHTML = cats.map(cat => {
    const rests = RESTAURANTS.filter(r => r.category === cat)
      .sort((a, b) => haversine(HOTEL.lat, HOTEL.lng, a.lat, a.lng) - haversine(HOTEL.lat, HOTEL.lng, b.lat, b.lng));
    const col = catColor(cat);

    const cardsHTML = rests.map(r => {
      const hashBadges = r.hashtags.map(h => `<span class="m-hash">#${h}</span>`).join('');
      return `
        <div class="rest-card" onclick="openModal('${r.id}')">
          <span class="rest-card-dot" style="background:${col}"></span>
          <div class="rest-card-info">
            <div class="rest-card-cn">${r.nameCN}</div>
            <div class="rest-card-kr">${dongCN(r.dongKR)} · ${r.nameKR || ''}</div>
            ${r.hashtags.length ? `<div class="rest-card-tags">${hashBadges}</div>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="cat-section">
        <div class="cat-section-hd" onclick="toggleDongSection('${safeAttr(cat)}')">
          <span class="cat-dot-badge" style="background:${col}"></span>
          <div class="cat-section-name-block">
            <span class="cat-section-name">${cat}</span>
          </div>
          <span class="cat-section-cnt">${rests.length} 間</span>
          <span class="cat-arrow" id="arr-${safeAttr(cat)}">›</span>
        </div>
        <div class="inline-rest-list" id="list-${safeAttr(cat)}">${cardsHTML}</div>
      </div>`;
  }).join('');

  app.innerHTML = `
    <div class="view cat-view">
      <div class="cat-header">
        <button class="btn-back" onclick="renderHome()">← 首頁</button>
        <span class="cat-header-title">分類清單</span>
        <span class="cat-header-sub">${RESTAURANTS.length} 間</span>
      </div>
      <div class="cat-body">${sectionsHTML}</div>
    </div>
  `;
}

function openCategoryList(catKey) {
  closeModal();
  renderDongListView(catKey, null);
}
function openTagList(tag) {
  closeModal();
  renderDongListView(null, tag);
}


// ============================================================
// VIEW 4 — LIST VIEW (with optional category / tag filter)
// ============================================================
function renderDongListView(filterCat = null, filterTag = null) {
  hideTip();
  S.view     = 'donglist';
  S.openDong = null;
  S.gu       = null;   // reset gu so back-from-dong goes to home

  const app = document.getElementById('app');

  // Apply filter
  let filtered = RESTAURANTS;
  if (filterCat) filtered = filtered.filter(r => r.category === filterCat);
  if (filterTag) filtered = filtered.filter(r => r.hashtags.includes(filterTag));

  // Dongs with matching restaurants, sorted by avg distance from hotel
  const dongKeys = [...new Set(filtered.map(r => r.dongKR).filter(Boolean))];
  dongKeys.sort((a, b) => {
    const avg = dk => {
      const rs = filtered.filter(r => r.dongKR === dk);
      return rs.reduce((s, r) => s + haversine(HOTEL.lat, HOTEL.lng, r.lat, r.lng), 0) / rs.length;
    };
    return avg(a) - avg(b);
  });

  // Filter indicator badges
  let filterBadge = '';
  if (filterCat) filterBadge += `
    <span class="cat-filter-active" style="background:${catColor(filterCat)}"
          onclick="renderDongListView()" title="清除篩選">
      ${filterCat} ✕
    </span>`;
  if (filterTag) filterBadge += `
    <span class="cat-filter-active cat-filter-tag"
          onclick="renderDongListView()" title="清除篩選">
      #${filterTag} ✕
    </span>`;

  const sectionsHTML = dongKeys.map(dongKR => {
    const rests = filtered.filter(r => r.dongKR === dongKR)
      .sort((a, b) => haversine(HOTEL.lat, HOTEL.lng, a.lat, a.lng) - haversine(HOTEL.lat, HOTEL.lng, b.lat, b.lng));
    const cn = dongCN(dongKR);

    const cardsHTML = rests.map(r => {
      const col = catColor(r.category);
      const hashBadges = r.hashtags.map(h => `<span class="m-hash">#${h}</span>`).join('');
      return `
        <div class="rest-card" onclick="openModal('${r.id}')">
          <span class="rest-card-dot" style="background:${col}"></span>
          <div class="rest-card-info">
            <div class="rest-card-cn">${r.nameCN}</div>
            <div class="rest-card-kr">${r.category}</div>
            ${r.hashtags.length ? `<div class="rest-card-tags">${hashBadges}</div>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="cat-section">
        <div class="cat-section-hd" onclick="toggleDongSection('${safeAttr(dongKR)}')">
          <span class="cat-dot-badge" style="background:#C8A84B"></span>
          <div class="cat-section-name-block">
            <span class="cat-section-name">${cn}</span>
            <span class="cat-section-sub">${dongKR}</span>
          </div>
          <span class="cat-section-cnt">${rests.length} 間</span>
          <span class="cat-arrow" id="arr-${safeAttr(dongKR)}">›</span>
        </div>
        <div class="inline-rest-list" id="list-${safeAttr(dongKR)}">${cardsHTML}</div>
      </div>`;
  }).join('');

  app.innerHTML = `
    <div class="view cat-view">
      <div class="cat-header">
        <button class="btn-back" onclick="renderHome()">← 首頁</button>
        <span class="cat-header-title">${filterCat || filterTag ? '篩選結果' : '全部清單'}</span>
        ${filterBadge}
        <span class="cat-header-sub">${filtered.length} 間</span>
      </div>
      ${dongKeys.length === 0
        ? `<div class="list-empty">沒有找到符合條件的餐廳</div>`
        : `<div class="cat-body">${sectionsHTML}</div>`}
    </div>
  `;
}

function toggleDongSection(dongKR) {
  const listEl = document.getElementById(`list-${dongKR}`);
  const arr    = document.getElementById(`arr-${dongKR}`);
  if (!listEl) return;
  const isOpen = listEl.classList.toggle('open');
  if (arr) arr.classList.toggle('open', isOpen);
}

// ============================================================
// Init
// ============================================================
async function init() {
  initParticles();
  loadMustEat();
  await loadGeo();
  checkAndImportSharedList();
  renderHome();

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

document.addEventListener('DOMContentLoaded', init);
