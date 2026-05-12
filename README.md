This app checks the modqueue every five minutes. If there are any posts or comments in the queue for shadowbanned, suspended or deleted users, the post or comment will be removed if configured to do so.

The app can be configured to remove posts or comments for deleted users or shadowbanned/suspended users - both options can be controlled independently.

You can also choose to lock comments and posts removed from the queue, and in the case of suspended or shadowbanned users who had queue items you can also choose to reply to removed items with a comment, e.g. if you wish to advise the user of the Reddit appeals process.

## Change History

### v1.2.4

* More robust checking of users - temporary errors will no longer cause active users to be removed from the queue.

### v1.2.0

* Add ability to remove modqueued items from recently banned users
* Add ability to lock removed items when removing from the modqueue
* Reduce the chances of incorrect removals during periods of Reddit infrastructure instability
* Update Devvit and dependencies
* Job execution is staggered on different subreddits to reduce spikes in activity on Devvit infrastructure

### v1.1.1

* Initial Release

## About this app

Modqueue Pruner is open source. [You can find the source here](https://github.com/fsvreddit/queue-pruner).
