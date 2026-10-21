import Link from "next/link";
import { authorHref, formatCount, kolCaptures, type Author } from "@/lib/atlas";
import { serverTr } from "@/lib/i18n-server";

function average(total: number, known: number) {
  return known ? formatCount(Math.round(total / known)) : "Hidden";
}

export async function KolMetrics({ authors, selected }: { authors: Author[]; selected?: Author }) {
  const tr = await serverTr();
  const entries = selected ? [selected] : [...authors].sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
  return <section className="kol-metrics" aria-labelledby="kol-metrics-heading">
    <div className="kol-metrics-heading"><div><p className="eyebrow">{tr("Instagram at capture", "擷取時的 Instagram 數據")} · {kolCaptures.map((capture) => `${capture.source} ${capture.date}`).join(" · ")}</p><h2 id="kol-metrics-heading">{tr("Popularity snapshot", "熱門程度快照")}</h2></div><p>{tr("Follower count is from each profile. Engagement averages use only the collected 2026 posts with visible counts; each post uses its most recent saved response. Shares are reported only by SocialCrawl.", "追蹤者人數取自各帳號。互動平均值只計算 2026 年已收藏且公開數據的貼文；每則貼文採用最新儲存的回應。分享數僅由 SocialCrawl 提供。")}</p></div>
    <div className="kol-metrics-scroll"><table><thead><tr><th>{tr("Creator", "創作者")}</th><th>{tr("Followers", "追蹤者")}</th><th>{tr("Avg likes", "平均喜歡數")}</th><th>{tr("Avg comments", "平均留言數")}</th><th>{tr("Avg video plays", "平均影片播放數")}</th><th>{tr("Avg shares", "平均分享數")}</th><th>{tr("Hidden counts", "未公開數據")}</th></tr></thead><tbody>
      {entries.map((author) => {
        const metrics = author.popularity;
        if (!metrics) return null;
        return <tr key={author.username}>
          <th><Link href={authorHref(author.username)}>@{author.username}</Link><small>{author.count} {tr("posts", "則貼文")}</small></th>
          <td>{formatCount(author.followers ?? null)}</td>
          <td title={tr(`${metrics.likesKnown} of ${author.count} posts with visible likes`, `${author.count} 則貼文中有 ${metrics.likesKnown} 則公開喜歡數`)}>{average(metrics.likes, metrics.likesKnown)}<small>{metrics.likesKnown}/{author.count} {tr("posts", "則貼文")}</small></td>
          <td title={tr(`${metrics.commentsKnown} of ${author.count} posts with visible comments`, `${author.count} 則貼文中有 ${metrics.commentsKnown} 則公開留言數`)}>{average(metrics.comments, metrics.commentsKnown)}</td>
          <td title={tr(`${metrics.playsKnown} videos with visible play counts`, `${metrics.playsKnown} 則影片公開播放數`)}>{metrics.playsKnown ? average(metrics.plays, metrics.playsKnown) : "—"}<small>{metrics.playsKnown}/{author.videoCount} {tr("videos", "則影片")}</small></td>
          <td title={tr(`${metrics.sharesKnown} posts with share counts`, `${metrics.sharesKnown} 則貼文有分享數`)}>{metrics.sharesKnown ? average(metrics.shares, metrics.sharesKnown) : "—"}<small>{metrics.sharesKnown}/{author.count} {tr("posts", "則貼文")}</small></td>
          <td>{metrics.hiddenPosts ? tr(`${metrics.hiddenPosts} posts`, `${metrics.hiddenPosts} 則貼文`) : "—"}</td>
        </tr>;
      })}
    </tbody></table></div>
    <p className="kol-metrics-note">{tr("Instagram marks some likes and views as hidden. Those values appear as hidden on post cards and are excluded from averages. This snapshot covers collected posts, not full account history.", "Instagram 將部分喜歡數與觀看數設為不公開。這些數值會在貼文卡片標示，且不列入平均值。本快照僅涵蓋已收藏貼文，並非帳號的完整歷史。")}</p>
  </section>;
}
