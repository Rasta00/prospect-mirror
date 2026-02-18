/**
 * Drupal JSON:API content population.
 * Pushes media, pages, and theme colors to the Acquia demo environment.
 */
const config = require('../../config/default');

const BASE = config.drupal.baseUrl.replace(/\/$/, '');
const AUTH = 'Basic ' + Buffer.from(`${config.drupal.username}:${config.drupal.password}`).toString('base64');

const HEADERS = {
  Authorization: AUTH,
  'Content-Type': 'application/vnd.api+json',
  Accept: 'application/vnd.api+json',
};

/**
 * Populate the Drupal demo site with extracted brand + content.
 */
async function populateDrupal(crawlData, brandData, contentAnalysis, progress) {
  progress.start('drupal', 'Populating Drupal demo site');

  const result = {
    siteUrl: BASE,
    pagesCreated: 0,
    mediaUploaded: 0,
    errors: [],
  };

  try {
    // 1. Upload media (logo + heroes)
    progress.progress('drupal', 20, 'Uploading media');
    const mediaIds = {};

    if (brandData?.logo) {
      try {
        const logoMedia = await uploadImage(brandData.logo, 'Logo');
        if (logoMedia) mediaIds.logo = logoMedia.id;
        result.mediaUploaded++;
      } catch (err) {
        result.errors.push(`Logo upload failed: ${err.message}`);
      }
    }

    for (let i = 0; i < Math.min(brandData?.heroes?.length || 0, 3); i++) {
      try {
        const hero = brandData.heroes[i];
        const heroMedia = await uploadImage(hero.src, `Hero ${i + 1}`);
        if (heroMedia) {
          mediaIds[`hero_${i}`] = heroMedia.id;
          result.mediaUploaded++;
        }
      } catch (err) {
        result.errors.push(`Hero ${i + 1} upload failed: ${err.message}`);
      }
    }

    // 2. Create landing page
    progress.progress('drupal', 50, 'Creating landing page');
    try {
      const pageData = buildPagePayload(crawlData, brandData, contentAnalysis, mediaIds);
      const page = await createNode(pageData);
      if (page) result.pagesCreated++;
    } catch (err) {
      result.errors.push(`Page creation failed: ${err.message}`);
    }

    // 3. Push theme colors (if supported)
    progress.progress('drupal', 80, 'Applying theme colors');
    if (brandData?.colors?.primary) {
      try {
        await pushThemeColors(brandData.colors);
      } catch (err) {
        result.errors.push(`Theme colors failed: ${err.message}`);
      }
    }

    progress.complete('drupal', {
      pagesCreated: result.pagesCreated,
      mediaUploaded: result.mediaUploaded,
      errors: result.errors.length,
    });
  } catch (err) {
    progress.fail('drupal', err.message);
  }

  return result;
}

/**
 * Upload an image from URL to Drupal media library.
 */
async function uploadImage(imageUrl, name) {
  // 1. Download image
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('svg') ? 'svg' : 'jpg';

  // 2. Upload file via Drupal file upload endpoint
  const filename = `${name.toLowerCase().replace(/\s+/g, '-')}.${ext}`;
  const uploadRes = await fetch(`${BASE}/jsonapi/node/page/field_image`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `file; filename="${filename}"`,
    },
    body: buffer,
  });

  // Fallback: try media entity approach
  if (!uploadRes.ok) {
    return await createMediaEntity(buffer, filename, name, contentType);
  }

  const data = await uploadRes.json();
  return data.data || null;
}

/**
 * Create a media entity via JSON:API.
 */
async function createMediaEntity(buffer, filename, name, contentType) {
  // Upload the file first
  const fileRes = await fetch(`${BASE}/jsonapi/file/file`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `file; filename="${filename}"`,
    },
    body: buffer,
  });

  if (!fileRes.ok) {
    const text = await fileRes.text();
    throw new Error(`File upload failed: ${fileRes.status} ${text.slice(0, 200)}`);
  }

  const fileData = await fileRes.json();
  const fileId = fileData.data?.id;
  if (!fileId) throw new Error('No file ID returned');

  // Create media entity referencing the file
  const mediaRes = await fetch(`${BASE}/jsonapi/media/image`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      data: {
        type: 'media--image',
        attributes: { name },
        relationships: {
          field_media_image: {
            data: { type: 'file--file', id: fileId },
          },
        },
      },
    }),
  });

  if (!mediaRes.ok) {
    const text = await mediaRes.text();
    throw new Error(`Media creation failed: ${mediaRes.status} ${text.slice(0, 200)}`);
  }

  return (await mediaRes.json()).data || null;
}

/**
 * Create a node (page) via JSON:API.
 */
async function createNode(payload) {
  const res = await fetch(`${BASE}/jsonapi/node/page`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Node creation failed: ${res.status} ${text.slice(0, 200)}`);
  }

  return (await res.json()).data || null;
}

/**
 * Build a JSON:API payload for a landing page.
 */
function buildPagePayload(crawlData, brandData, contentAnalysis, mediaIds) {
  const title = contentAnalysis?.companyName || crawlData.title || 'Prospect Demo';
  const body = crawlData.cleanHtml || `<p>${crawlData.textContent?.slice(0, 2000) || ''}</p>`;

  const payload = {
    data: {
      type: 'node--page',
      attributes: {
        title: `${title} — Branded Demo`,
        body: {
          value: body,
          format: 'full_html',
        },
        status: true,
      },
      relationships: {},
    },
  };

  // Add hero image if available
  if (mediaIds.hero_0) {
    payload.data.relationships.field_image = {
      data: { type: 'media--image', id: mediaIds.hero_0 },
    };
  }

  return payload;
}

/**
 * Push theme colors to a custom Drupal config endpoint (if available).
 * Falls back gracefully if the endpoint doesn't exist.
 */
async function pushThemeColors(colors) {
  // Try custom config endpoint
  const res = await fetch(`${BASE}/api/theme-colors`, {
    method: 'POST',
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
    }),
  });

  // Non-fatal if endpoint doesn't exist
  if (!res.ok && res.status !== 404) {
    throw new Error(`Theme color push failed: ${res.status}`);
  }
}

module.exports = { populateDrupal };
