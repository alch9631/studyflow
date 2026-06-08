#!/usr/bin/env bash
# StudyFlow managed continuous-loop controller — ONE tick per run.
# Deterministic VCS plumbing: merge green PRs, advance backlog, emit ACTION lines.
# The cron agent reads ACTION lines and spawns/fixes builders accordingly.
#
# ACTION lines (stdout, machine-readable, pipe-delimited):
#   SPAWN|<track>|<branch>|<item>     -> spawn a fresh builder for this item
#   FIX|<track>|<branch>|<prnum>|<item> -> CI failing, spawn a fixer on the branch
#   MERGED|<track>|<prnum>|<item>     -> merged (informational)
#   PENDING|<track>|<prnum>           -> CI still running, do nothing
#   WORKING|<track>|<item>            -> builder still working (no PR yet)
#   MERGE_BLOCKED|<track>|<prnum>|<reason> -> green but not mergeable (e.g. conflict)
#   DONE|<track>                      -> backlog empty, track finished
#   ALL_DONE                          -> both tracks finished; cron should stop
set -uo pipefail
SF=/home/pipi/.openclaw/workspace/studyflow
STATE="$SF/ops/loop-state.json"
cd "$SF" || { echo "ERR|cd"; exit 1; }
git fetch origin -q 2>/dev/null

getf(){ node -e "const s=require('$STATE');let v=s$1;process.stdout.write(v==null?'':String(v))"; }
setf(){ node -e "const fs=require('fs');const s=require('$STATE');$1;fs.writeFileSync('$STATE',JSON.stringify(s,null,2))"; }

next_item(){ node -e "const fs=require('fs');const t=fs.readFileSync('$1','utf8');const m=t.split('\n').find(l=>/^- \[ \] /.test(l));process.stdout.write(m?m.replace(/^- \[ \] /,'').trim():'')"; }
mark_done(){ node -e "const fs=require('fs');const f='$1',item=process.argv[1];let ls=fs.readFileSync(f,'utf8').split('\n');for(let i=0;i<ls.length;i++){if(/^- \[ \] /.test(ls[i])&&ls[i].replace(/^- \[ \] /,'').trim()===item){ls[i]=ls[i].replace('- [ ]','- [x]');break;}}fs.writeFileSync(f,ls.join('\n'))" "$2"; }

# Evaluate a PR's CI rollup -> prints: pass | fail | pending
ci_state(){ gh pr view "$1" --json statusCheckRollup --jq '
  if (.statusCheckRollup|length)==0 then "pending"
  elif any(.statusCheckRollup[]; (.conclusion // .state) as $c | $c|test("FAILURE|CANCELLED|TIMED_OUT|ACTION_REQUIRED|ERROR";"i")) then "fail"
  elif any(.statusCheckRollup[]; (.status // "COMPLETED") != "COMPLETED" and (.state // "COMPLETED") != "SUCCESS") then "pending"
  else "pass" end' 2>/dev/null; }

process_track(){
  local track=$1
  local branch wt backlog cycle inflight status
  branch=$(getf ".tracks.$track.branch"); wt=$(getf ".tracks.$track.worktree")
  backlog=$(getf ".tracks.$track.backlog"); cycle=$(getf ".tracks.$track.cycle")
  inflight=$(getf ".tracks.$track.inflight"); status=$(getf ".tracks.$track.status")
  [ "$status" = "done" ] && { echo "DONE|$track"; return; }

  local num; num=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number' 2>/dev/null)
  if [ -n "$num" ]; then
    local ci; ci=$(ci_state "$num")
    if [ "$ci" = "fail" ]; then echo "FIX|$track|$branch|$num|$inflight"; return; fi
    if [ "$ci" = "pending" ] || [ -z "$ci" ]; then echo "PENDING|$track|$num"; return; fi
    # green -> check mergeable then squash-merge (auto-merge when green)
    local mrg; mrg=$(gh pr view "$num" --json mergeable --jq '.mergeable' 2>/dev/null)
    if [ "$mrg" = "CONFLICTING" ]; then echo "MERGE_BLOCKED|$track|$num|conflict"; return; fi
    # squash-merge; do NOT --delete-branch (fails when branch is checked out in a worktree)
    gh pr merge "$num" --squash >/dev/null 2>&1
    local prstate; prstate=$(gh pr view "$num" --json state --jq '.state' 2>/dev/null)
    if [ "$prstate" = "MERGED" ]; then
      echo "MERGED|$track|$num|$inflight"
      [ -n "$inflight" ] && { mark_done "$backlog" "$inflight"; git add "$backlog" >/dev/null 2>&1; \
        git commit -q -m "loop($track): complete backlog item — $inflight" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" >/dev/null 2>&1; \
        # squash-merge just advanced origin/main; rebase our backlog commit on top so the push fast-forwards
        git fetch origin -q 2>/dev/null; \
        git pull -q --rebase --autostash origin main >/dev/null 2>&1; \
        git push -q origin main 2>/dev/null; }
      git fetch origin -q 2>/dev/null
      setf "s.tracks.$track.inflight=''"
    else
      echo "MERGE_BLOCKED|$track|$num|$prstate"
    fi
    return
  fi

  # No open PR
  if [ -n "$inflight" ]; then echo "WORKING|$track|$inflight"; return; fi
  local item; item=$(next_item "$backlog")
  if [ -z "$item" ]; then setf "s.tracks.$track.status='done'"; echo "DONE|$track"; return; fi
  local nc=$((cycle+1)); local nb="auto/$track-$nc"
  git -C "$wt" reset --hard -q 2>/dev/null
  git -C "$wt" fetch origin -q 2>/dev/null
  git -C "$wt" checkout -B "$nb" origin/main -q 2>/dev/null
  node -e "const fs=require('fs');const s=require('$STATE');const t='$track';s.tracks[t].branch=process.argv[1];s.tracks[t].cycle=+process.argv[2];s.tracks[t].inflight=process.argv[3];fs.writeFileSync('$STATE',JSON.stringify(s,null,2))" "$nb" "$nc" "$item"
  echo "SPAWN|$track|$nb|$item"
}

process_track fe
process_track be

# ALL_DONE if both done
if [ "$(getf '.tracks.fe.status')" = "done" ] && [ "$(getf '.tracks.be.status')" = "done" ]; then
  echo "ALL_DONE"
fi
