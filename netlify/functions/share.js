
exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const type = params.type === "job" ? "job" : "product";
  const id = params.id || "";

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey || !id) {
    return { statusCode: 400, body: "Missing configuration or ID." };
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { statusCode: 400, body: "Invalid item ID." };
  }

  const esc = value => String(value || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  async function readTable(table, fields) {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    url.searchParams.set("select", fields);
    url.searchParams.set("id", `eq.${id}`);
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Database read failed: ${table}`);
    }

    const rows = await response.json();
    return rows[0] || null;
  }

  try {
    let item;
    let image = "";

    if (type === "job") {
      item = await readTable(
        "jobs",
        "id,title,company,description,requirements,image_url,media_url,video_url,is_public"
      );

      if (!item || item.is_public !== true) {
        return { statusCode: 404, body: "Public job not found." };
      }

      image = item.image_url || item.media_url || "";
    } else {
      item = await readTable(
        "products",
        "id,name,title,description,image_url,image_urls,thumbnail_url,media_url,is_public"
      );

      if (!item || item.is_public === false) {
        return { statusCode: 404, body: "Public product not found." };
      }

      image =
        item.thumbnail_url ||
        item.image_url ||
        (Array.isArray(item.image_urls) ? item.image_urls[0] : "") ||
        item.media_url ||
        "";

      if (!image) {
        const url = new URL("/rest/v1/product_media", supabaseUrl);
        url.searchParams.set("select", "file_url");
        url.searchParams.set("product_id", `eq.${id}`);
        url.searchParams.set("is_public", "eq.true");
        url.searchParams.set("limit", "1");

        const response = await fetch(url, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`
          }
        });

        if (response.ok) {
          const media = await response.json();
          image = media[0]?.file_url || "";
        }
      }
    }

    const title = type === "job"
      ? item.title || "Akazi kuri Trcose Market"
      : item.name || item.title || "Igicuruzwa kuri Trcose Market";

    const description = String(
      item.description ||
      item.requirements ||
      "Reba amakuru arambuye kuri Trcose Market."
    ).replace(/\s+/g, " ").trim();

    const destination = type === "job"
      ? `https://market-co.github.io/Trcose/job.html?job=${encodeURIComponent(id)}`
      : `https://market-co.github.io/Trcose/index.html#?product=${encodeURIComponent(id)}`;

    const shareUrl =
      `https://trcose.netlify.app/.netlify/functions/share?type=${type}&id=${encodeURIComponent(id)}`;

    const safeImage =
      typeof image === "string" && /^https:\/\//i.test(image.trim())
        ? image.trim()
        : "";

    const userAgent = event.headers?.["user-agent"] ||
      event.headers?.["User-Agent"] || "";

    const isPreviewBot =
      /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|skypeuripreview|pinterest|googlebot|bingbot/i
        .test(userAgent);

    // Abantu basanzwe bahita bajya ku rupapuro nyarwo.
    if (!isPreviewBot) {
      return {
        statusCode: 302,
        headers: {
          Location: destination,
          "Cache-Control": "no-store"
        },
        body: ""
      };
    }

    // Ama-bot abona amakuru ya Open Graph kugira ngo yerekane preview.
    const html = `<!doctype html>
<html lang="rw">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | Trcose Market</title>
<meta name="description" content="${esc(description.slice(0, 300))}">
<meta property="og:site_name" content="Trcose Market">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description.slice(0, 300))}">
<meta property="og:url" content="${esc(shareUrl)}">
${safeImage ? `
<meta property="og:image" content="${esc(safeImage)}">
<meta property="og:image:secure_url" content="${esc(safeImage)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:image" content="${esc(safeImage)}">
` : ""}
<meta name="twitter:card" content="${safeImage ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description.slice(0, 300))}">
<meta http-equiv="refresh" content="0;url=${esc(destination)}">
</head>
<body>
<h1>${esc(title)}</h1>
<p>${esc(description)}</p>
${safeImage ? `<img src="${esc(safeImage)}" alt="${esc(title)}" style="max-width:100%;height:auto">` : ""}
<p><a href="${esc(destination)}">Fungura kuri Trcose Market</a></p>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60"
      },
      body: html
    };
  } catch (error) {
    console.error("Share function error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      },
      body: "Ntibyashobotse kubona amakuru. Reba Netlify logs na Supabase permissions."
    };
  }
};
